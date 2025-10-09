#!/usr/bin/env python3
"""
Vascular Command Parser
Parses voice commands specific to vascular procedures
"""
import re
import json
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class VascularCommandParser:
    """Parse vascular procedure voice commands"""
    
    def __init__(self, mappings_file: Path = Path("config/field_mappings.json")):
        self.mappings = self._load_mappings(mappings_file)
        self.vessel_names = [
            "common iliac", "external iliac", "common femoral",
            "superficial femoral", "profunda", "popliteal",
            "anterior tibial", "posterior tibial", "peroneal",
            "tibial peroneal trunk"
        ]
    
    def _load_mappings(self, path: Path) -> Dict:
        """Load field mappings from JSON"""
        if not path.exists():
            logger.warning(f"Mappings file not found: {path}")
            return {}
        
        with open(path, "r") as f:
            return json.load(f)
    
    def parse(self, text: str) -> Optional[Tuple[str, Dict[str, Any]]]:
        """
        Parse voice command and return (command_type, params)
        
        Returns:
            Tuple of (command, params) or None if not a command
        """
        text_clean = text.lower().strip()
        
        # Insert macro command
        if text_clean.startswith("insert "):
            macro_name = text_clean.replace("insert ", "").strip()
            if "vascular" in macro_name or "procedure" in macro_name:
                return ("insert_macro", {"macro_name": "vascular_procedure"})
        
        # Set field command
        set_match = re.match(
            r"(?:set|fill)\s+(.+?)\s+(?:to|is|as)\s+(.+)",
            text_clean,
            re.IGNORECASE
        )
        if set_match:
            field_name, value = set_match.groups()
            return self._parse_set_command(field_name.strip(), value.strip())
        
        # Save procedure command
        if any(keyword in text_clean for keyword in ["save procedure", "save note", "complete procedure"]):
            return ("save_procedure", {})
        
        # Clear buffer command
        if "clear buffer" in text_clean or "start over" in text_clean:
            return ("clear_buffer", {})
        
        # Show fields command
        if "show fields" in text_clean or "what fields" in text_clean:
            return ("show_fields", {})
        
        return None
    
    def _parse_set_command(self, field_name: str, value: str) -> Tuple[str, Dict]:
        """Parse a 'set field to value' command"""
        
        # Check if it's a vessel-specific field
        for vessel in self.vessel_names:
            if vessel in field_name:
                vessel_key = vessel.replace(" ", "_")
                
                # Determine what property of the vessel
                if "occlusion" in field_name or "length" in field_name:
                    return ("set_vessel_field", {
                        "vessel": vessel_key,
                        "property": "occlusion_length",
                        "value": self._normalize_length(value)
                    })
                
                elif "treatment" in field_name:
                    return ("set_vessel_field", {
                        "vessel": vessel_key,
                        "property": "treatment",
                        "value": self._normalize_treatment(value)
                    })
                
                elif "tasc" in field_name:
                    return ("set_vessel_field", {
                        "vessel": vessel_key,
                        "property": "tasc",
                        "value": self._normalize_tasc(value)
                    })
                
                elif "calcification" in field_name:
                    return ("set_vessel_field", {
                        "vessel": vessel_key,
                        "property": "calcification",
                        "value": self._normalize_calcification(value)
                    })
        
        # Standard procedure fields
        field_map = self.mappings.get("procedure_fields", {})
        
        # Procedure side
        if "side" in field_name or "laterality" in field_name:
            return ("set_field", {
                "field": "procedure_side",
                "value": self._normalize_side(value)
            })
        
        # Access site
        if "access" in field_name:
            return ("set_field", {
                "field": "access_site",
                "value": self._normalize_access(value)
            })
        
        # Sheath size
        if "sheath" in field_name:
            return ("set_field", {
                "field": "sheath_size",
                "value": self._normalize_sheath(value)
            })
        
        # Closure method
        if "closure" in field_name or "mynx" in field_name:
            return ("set_field", {
                "field": "closure_method",
                "value": self._normalize_closure(value)
            })
        
        # Default: treat as generic field
        return ("set_field", {
            "field": field_name.replace(" ", "_"),
            "value": value
        })
    
    def _normalize_length(self, value: str) -> str:
        """Normalize occlusion length"""
        # Extract numbers
        numbers = re.findall(r'\d+\.?\d*', value)
        if numbers:
            length = numbers[0]
            if "centimeter" in value or "cm" in value:
                return f"{length} cm"
            elif "millimeter" in value or "mm" in value:
                return f"{length} mm"
            return f"{length} cm"  # Default to cm
        return value
    
    def _normalize_treatment(self, value: str) -> str:
        """Normalize treatment type"""
        treatments = {
            "pta": "PTA",
            "angioplasty": "PTA",
            "balloon": "PTA",
            "stent": "Stent",
            "stenting": "Stent",
            "atherectomy": "Atherectomy",
            "tpa": "TPA",
            "thrombolysis": "Mechanical Thrombolysis"
        }
        
        value_lower = value.lower()
        
        # Check for combinations
        if ("pta" in value_lower or "angioplasty" in value_lower) and "stent" in value_lower:
            return "PTA + Stent"
        
        # Single treatment
        for key, normalized in treatments.items():
            if key in value_lower:
                return normalized
        
        return value
    
    def _normalize_tasc(self, value: str) -> str:
        """Normalize TASC classification"""
        # Extract letter
        letters = re.findall(r'[a-dA-D]', value)
        if letters:
            return letters[0].upper()
        return value.upper()
    
    def _normalize_calcification(self, value: str) -> str:
        """Normalize calcification level"""
        if "none" in value.lower():
            return "none"
        elif "mild" in value.lower():
            return "mild"
        elif "moderate" in value.lower():
            return "moderate"
        elif "severe" in value.lower() or "heavy" in value.lower():
            return "severe"
        return value
    
    def _normalize_side(self, value: str) -> str:
        """Normalize procedure side"""
        if "left" in value.lower():
            return "left"
        elif "right" in value.lower():
            return "right"
        elif "both" in value.lower() or "bilateral" in value.lower():
            return "bilateral"
        return value
    
    def _normalize_access(self, value: str) -> str:
        """Normalize access site"""
        if "femoral" in value.lower():
            return "femoral"
        elif "radial" in value.lower():
            return "radial"
        elif "brachial" in value.lower():
            return "brachial"
        elif "pop" in value.lower() or "popliteal" in value.lower():
            return "popliteal"
        return value
    
    def _normalize_sheath(self, value: str) -> str:
        """Normalize sheath size"""
        # Extract numbers
        numbers = re.findall(r'\d+', value)
        if numbers:
            return f"{numbers[0]}fr"
        return value
    
    def _normalize_closure(self, value: str) -> str:
        """Normalize closure method"""
        if "mynx" in value.lower():
            return "mynx"
        elif "manual" in value.lower() or "pressure" in value.lower():
            return "manual"
        return value


# Test the parser
if __name__ == "__main__":
    parser = VascularCommandParser()
    
    test_commands = [
        "insert vascular procedure",
        "set procedure side to left",
        "set superficial femoral occlusion to 8 centimeters",
        "set superficial femoral treatment to PTA and stent",
        "set common iliac TASC to C",
        "set access to femoral",
        "set sheath size to 5 french",
        "save procedure"
    ]
    
    print("🧪 Testing Vascular Command Parser\n")
    for cmd in test_commands:
        result = parser.parse(cmd)
        if result:
            command_type, params = result
            print(f"✅ '{cmd}'")
            print(f"   → {command_type}: {params}\n")
        else:
            print(f"❌ '{cmd}' - Not recognized\n")