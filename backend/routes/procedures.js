const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Procedure = require('../models/Procedure');
const { Op } = require('sequelize');

// Validation middleware
const validateProcedure = [
  body('patient_name').notEmpty().withMessage('Patient name is required'),
  body('mrn').notEmpty().withMessage('MRN is required'),
];

// GET /api/procedures - Get all procedures with optional filters
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      mrn, 
      start_date, 
      end_date, 
      surgeon,
      limit = 50,
      offset = 0 
    } = req.query;

    const where = {};
    
    if (status) where.status = status;
    if (mrn) where.mrn = mrn;
    if (surgeon) where.surgeon = surgeon;
    if (start_date || end_date) {
      where.procedure_date = {};
      if (start_date) where.procedure_date[Op.gte] = new Date(start_date);
      if (end_date) where.procedure_date[Op.lte] = new Date(end_date);
    }

    const procedures = await Procedure.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['procedure_date', 'DESC']],
    });

    res.json({
      success: true,
      data: procedures.rows,
      total: procedures.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching procedures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch procedures',
      message: error.message
    });
  }
});

// GET /api/procedures/:id - Get single procedure by ID
router.get('/:id', async (req, res) => {
  try {
    const procedure = await Procedure.findByPk(req.params.id);
    
    if (!procedure) {
      return res.status(404).json({
        success: false,
        error: 'Procedure not found'
      });
    }

    res.json({
      success: true,
      data: procedure
    });
  } catch (error) {
    console.error('Error fetching procedure:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch procedure',
      message: error.message
    });
  }
});

// POST /api/procedures - Create new procedure
router.post('/', validateProcedure, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const procedure = await Procedure.create(req.body);

    res.status(201).json({
      success: true,
      data: procedure,
      message: 'Procedure created successfully'
    });
  } catch (error) {
    console.error('Error creating procedure:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create procedure',
      message: error.message
    });
  }
});

// PUT /api/procedures/:id - Update procedure
router.put('/:id', async (req, res) => {
  try {
    const procedure = await Procedure.findByPk(req.params.id);
    
    if (!procedure) {
      return res.status(404).json({
        success: false,
        error: 'Procedure not found'
      });
    }

    await procedure.update(req.body);

    res.json({
      success: true,
      data: procedure,
      message: 'Procedure updated successfully'
    });
  } catch (error) {
    console.error('Error updating procedure:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update procedure',
      message: error.message
    });
  }
});

// PATCH /api/procedures/:id/vessel - Update specific vessel data
router.patch('/:id/vessel', async (req, res) => {
  try {
    const { vessel_name, vessel_data } = req.body;
    
    if (!vessel_name || !vessel_data) {
      return res.status(400).json({
        success: false,
        error: 'vessel_name and vessel_data are required'
      });
    }

    const procedure = await Procedure.findByPk(req.params.id);
    
    if (!procedure) {
      return res.status(404).json({
        success: false,
        error: 'Procedure not found'
      });
    }

    // Update specific vessel data
    await procedure.update({
      [vessel_name]: vessel_data
    });

    res.json({
      success: true,
      data: procedure,
      message: `${vessel_name} updated successfully`
    });
  } catch (error) {
    console.error('Error updating vessel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update vessel',
      message: error.message
    });
  }
});

// PATCH /api/procedures/:id/status - Update procedure status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required'
      });
    }

    const procedure = await Procedure.findByPk(req.params.id);
    
    if (!procedure) {
      return res.status(404).json({
        success: false,
        error: 'Procedure not found'
      });
    }

    await procedure.update({ status });

    res.json({
      success: true,
      data: procedure,
      message: 'Status updated successfully'
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
});

// DELETE /api/procedures/:id - Delete procedure
router.delete('/:id', async (req, res) => {
  try {
    const procedure = await Procedure.findByPk(req.params.id);
    
    if (!procedure) {
      return res.status(404).json({
        success: false,
        error: 'Procedure not found'
      });
    }

    await procedure.destroy();

    res.json({
      success: true,
      message: 'Procedure deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting procedure:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete procedure',
      message: error.message
    });
  }
});

// GET /api/procedures/stats/summary - Get procedure statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await Procedure.count();
    const completed = await Procedure.count({ where: { status: 'completed' } });
    const inProgress = await Procedure.count({ where: { status: 'in_progress' } });
    const draft = await Procedure.count({ where: { status: 'draft' } });

    res.json({
      success: true,
      data: {
        total,
        completed,
        in_progress: inProgress,
        draft
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

module.exports = router;