const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Patient = require('../models/Patient');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Validation rules
const patientValidation = [
    body('mrn').notEmpty().withMessage('MRN is required'),
    body('first_name').notEmpty().withMessage('First name is required'),
    body('last_name').notEmpty().withMessage('Last name is required'),
    body('date_of_birth').isDate().withMessage('Valid date of birth required'),
    body('email').optional().isEmail().withMessage('Valid email required')
];

// GET /api/patients - Get all patients
router.get('/', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const {
            search,
            active = 'true',
            limit = 50,
            offset = 0,
            sortBy = 'last_name',
            sortOrder = 'ASC'
        } = req.query;
        
        const where = {};
        
        // Active filter
        if (active !== 'all') {
            where.active = active === 'true';
        }
        
        // Search filter
        if (search) {
            where[Op.or] = [
                { mrn: { [Op.iLike]: `%${search}%` } },
                { first_name: { [Op.iLike]: `%${search}%` } },
                { last_name: { [Op.iLike]: `%${search}%` } }
            ];
        }
        
        const patients = await Patient.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder]]
        });
        
        const duration = Date.now() - startTime;
        logger.logAPI('GET', '/api/patients', 200, duration, {
            count: patients.count,
            returned: patients.rows.length
        });
        
        res.json({
            success: true,
            data: patients.rows,
            total: patients.count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.logAPI('GET', '/api/patients', 500, duration, { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch patients',
            message: error.message
        });
    }
});

// GET /api/patients/search/:query - Search patients
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        
        const patients = await Patient.findAll({
            where: {
                [Op.or]: [
                    { mrn: { [Op.iLike]: `%${query}%` } },
                    { first_name: { [Op.iLike]: `%${query}%` } },
                    { last_name: { [Op.iLike]: `%${query}%` } }
                ],
                active: true
            },
            limit: 20,
            order: [['last_name', 'ASC']]
        });
        
        logger.logPatient('SEARCH', query, { results: patients.length });
        
        res.json({
            success: true,
            data: patients
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Search failed', { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Search failed',
            message: error.message
        });
    }
});

// GET /api/patients/mrn/:mrn - Get patient by MRN
router.get('/mrn/:mrn', async (req, res) => {
    try {
        const { mrn } = req.params;
        
        const patient = await Patient.findOne({
            where: { mrn }
        });
        
        if (!patient) {
            logger.warning('PATIENT', `Patient not found: ${mrn}`);
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        
        logger.logPatient('RETRIEVED', mrn, { id: patient.id });
        
        res.json({
            success: true,
            data: patient
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Retrieval failed', { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve patient',
            message: error.message
        });
    }
});

// GET /api/patients/:id - Get patient by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const patient = await Patient.findByPk(id);
        
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        
        // Calculate current age
        patient.age = patient.calculateAge();
        
        logger.logPatient('RETRIEVED', patient.mrn, { id: patient.id });
        
        res.json({
            success: true,
            data: patient
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Retrieval failed', { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve patient',
            message: error.message
        });
    }
});

// POST /api/patients - Create new patient
router.post('/', patientValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        // Check if MRN already exists
        const existing = await Patient.findOne({
            where: { mrn: req.body.mrn }
        });
        
        if (existing) {
            logger.warning('PATIENT', `Duplicate MRN: ${req.body.mrn}`);
            return res.status(409).json({
                success: false,
                error: 'Patient with this MRN already exists'
            });
        }
        
        // Calculate age
        const dob = new Date(req.body.date_of_birth);
        const age = new Date().getFullYear() - dob.getFullYear();
        
        const patient = await Patient.create({
            ...req.body,
            age,
            created_by: req.user?.id || 'system'
        });
        
        logger.logPatient('CREATED', patient.mrn, {
            id: patient.id,
            name: patient.getFullName()
        });
        
        res.status(201).json({
            success: true,
            data: patient,
            message: 'Patient created successfully'
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Creation failed', {
            error: error.message,
            mrn: req.body.mrn
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to create patient',
            message: error.message
        });
    }
});

// PUT /api/patients/:id - Update patient
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const patient = await Patient.findByPk(id);
        
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        
        // Recalculate age if DOB changed
        if (req.body.date_of_birth) {
            const dob = new Date(req.body.date_of_birth);
            req.body.age = new Date().getFullYear() - dob.getFullYear();
        }
        
        await patient.update({
            ...req.body,
            last_updated_by: req.user?.id || 'system'
        });
        
        logger.logPatient('UPDATED', patient.mrn, {
            id: patient.id,
            changes: Object.keys(req.body)
        });
        
        res.json({
            success: true,
            data: patient,
            message: 'Patient updated successfully'
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Update failed', { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Failed to update patient',
            message: error.message
        });
    }
});

// DELETE /api/patients/:id - Soft delete patient
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const patient = await Patient.findByPk(id);
        
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        
        // Soft delete (set active = false)
        await patient.update({ active: false });
        
        logger.logPatient('DELETED', patient.mrn, { id: patient.id });
        
        res.json({
            success: true,
            message: 'Patient deactivated successfully'
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Deletion failed', { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Failed to delete patient',
            message: error.message
        });
    }
});

// GET /api/patients/:id/procedures - Get patient's procedures
router.get('/:id/procedures', async (req, res) => {
    try {
        const { id } = req.params;
        const Procedure = require('../models/Procedure');
        
        const patient = await Patient.findByPk(id);
        
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        
        const procedures = await Procedure.findAll({
            where: { mrn: patient.mrn },
            order: [['procedure_date', 'DESC']]
        });
        
        logger.logPatient('PROCEDURES_RETRIEVED', patient.mrn, {
            count: procedures.length
        });
        
        res.json({
            success: true,
            data: procedures,
            count: procedures.length
        });
        
    } catch (error) {
        logger.error('PATIENT', 'Procedure retrieval failed', { error: error.message });
        
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve procedures',
            message: error.message
        });
    }
});

module.exports = router;