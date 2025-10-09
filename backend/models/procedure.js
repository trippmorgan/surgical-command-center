const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Procedure = sequelize.define('procedure', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Patient Information
  patient_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mrn: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dob: {
    type: DataTypes.DATEONLY
  },
  age: {
    type: DataTypes.INTEGER
  },
  
  // Procedure Details
  procedure_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Lower Extremity Angiogram'
  },
  procedure_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  surgeon: {
    type: DataTypes.STRING
  },
  procedure_side: {
    type: DataTypes.ENUM('left', 'right', 'bilateral'),
    allowNull: true
  },
  
  // Access Information
  access_site: {
    type: DataTypes.STRING
  },
  access_guide: {
    type: DataTypes.STRING
  },
  sheath_size: {
    type: DataTypes.STRING
  },
  closure_method: {
    type: DataTypes.STRING
  },
  
  // Vessel Data (stored as JSONB for flexibility)
  common_iliac: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  external_iliac: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  common_femoral: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  superficial_femoral: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  profunda: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  popliteal: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  anterior_tibial: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  posterior_tibial: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  peroneal: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  tibial_peroneal_trunk: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  
  // Complications and Notes
  complications: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  puncture_site_hematoma: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hematoma_severity: {
    type: DataTypes.ENUM('none', 'minor', 'moderate'),
    defaultValue: 'none'
  },
  stent_planned: {
    type: DataTypes.BOOLEAN
  },
  
  // Patent Outflow
  patent_outflow_proximal: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  patent_outflow_distal: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Metadata
  procedure_duration: {
    type: DataTypes.INTEGER, // in minutes
    allowNull: true
  },
  voice_commands_used: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('draft', 'in_progress', 'completed', 'finalized'),
    defaultValue: 'draft'
  },
  
  // Data Sources
  ultralinq_data: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  athena_data: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  mirror_ledger_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  // Full text narrative (for Dragon dictation)
  narrative: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Audit Trail
  created_by: {
    type: DataTypes.STRING
  },
  modified_by: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'procedures',
  timestamps: true,
  indexes: [
    {
      fields: ['mrn']
    },
    {
      fields: ['procedure_date']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Procedure;