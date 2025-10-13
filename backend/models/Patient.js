const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Patient = sequelize.define('patient', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    
    // Core Demographics
    mrn: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true
        }
    },
    
    first_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    
    last_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    
    middle_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    date_of_birth: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    
    age: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    
    gender: {
        type: DataTypes.ENUM('male', 'female', 'other', 'unknown'),
        defaultValue: 'unknown'
    },
    
    // Contact Information
    phone_primary: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    phone_secondary: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            isEmail: true
        }
    },
    
    // Address
    address_line1: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    address_line2: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    city: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    state: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    zip_code: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    country: {
        type: DataTypes.STRING,
        defaultValue: 'USA'
    },
    
    // Emergency Contact
    emergency_contact_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    emergency_contact_phone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    emergency_contact_relationship: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    // Insurance (Basic)
    insurance_provider: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    insurance_policy_number: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    insurance_group_number: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    // Medical Information
    primary_physician: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    allergies: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    
    current_medications: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    
    medical_history: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    
    // Administrative
    primary_language: {
        type: DataTypes.STRING,
        defaultValue: 'English'
    },
    
    race: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    ethnicity: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    marital_status: {
        type: DataTypes.ENUM('single', 'married', 'divorced', 'widowed', 'other'),
        allowNull: true
    },
    
    ssn_last_four: {
        type: DataTypes.STRING(4),
        allowNull: true
    },
    
    // Status
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    
    // Metadata
    created_by: {
        type: DataTypes.STRING
    },
    
    last_updated_by: {
        type: DataTypes.STRING
    }
}, {
    tableName: 'patients',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['mrn']
        },
        {
            fields: ['last_name', 'first_name']
        },
        {
            fields: ['date_of_birth']
        },
        {
            fields: ['active']
        }
    ]
});

// Add relationship to Procedure model
Patient.associate = (models) => {
    Patient.hasMany(models.Procedure, {
        foreignKey: 'patient_id',
        as: 'procedures'
    });
};

// Virtual field for full name
Patient.prototype.getFullName = function() {
    return `${this.last_name}, ${this.first_name}${this.middle_name ? ' ' + this.middle_name : ''}`;
};

// Calculate age from DOB
Patient.prototype.calculateAge = function() {
    const today = new Date();
    const birthDate = new Date(this.date_of_birth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
};

module.exports = Patient;