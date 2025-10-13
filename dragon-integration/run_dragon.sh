#!/bin/bash

# Dragon Dictation Launch Script
# Automatically detects hardware and uses optimal settings

echo "🎙️ Starting Dragon Dictation - Surgical Command Center"
echo ""

# Check if backend is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "⚠️  WARNING: Backend server not running!"
    echo "Please start backend in another terminal:"
    echo "  cd ../backend && npm run dev"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Detect CUDA availability
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected"
    CUDA_VERSION=$(nvcc --version | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    echo "   CUDA Version: $CUDA_VERSION"
    
    # Check if CUDA 11.5 (your version)
    if [[ $CUDA_VERSION == 11.5* ]]; then
        echo "   Using CPU mode (CUDA 11.5 has compatibility issues with newer cuDNN)"
        DEVICE="cpu"
        COMPUTE_TYPE="int8"
    else
        echo "   GPU mode available"
        DEVICE="cuda"
        COMPUTE_TYPE="float16"
    fi
else
    echo "ℹ️  No NVIDIA GPU detected, using CPU"
    DEVICE="cpu"
    COMPUTE_TYPE="int8"
fi

echo ""
echo "Configuration:"
echo "  Model: small.en"
echo "  Device: $DEVICE"
echo "  Compute Type: $COMPUTE_TYPE"
echo ""

# Launch the application
python dragon_integrated.py \
    --model small.en \
    --device $DEVICE \
    --compute_type $COMPUTE_TYPE \
    --backend ws://localhost:3000

echo ""
echo "Dragon Dictation stopped"