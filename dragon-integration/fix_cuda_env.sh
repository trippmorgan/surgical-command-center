#!/bin/bash

# Fix CUDA/cuDNN compatibility for older GPUs
# This script configures the environment to use CPU-optimized packages

echo "🔧 Fixing CUDA environment for GTX TITAN X (CUDA 11.5)"
echo ""

# Activate conda environment
if [ -z "$CONDA_DEFAULT_ENV" ] || [ "$CONDA_DEFAULT_ENV" != "surgical_backend" ]; then
    echo "⚠️  Please activate the conda environment first:"
    echo "   conda activate surgical_backend"
    exit 1
fi

echo "1️⃣ Uninstalling GPU-specific packages..."
pip uninstall -y torch torchvision torchaudio

echo ""
echo "2️⃣ Installing CPU-optimized PyTorch..."
# Install CPU-only PyTorch (no CUDA conflicts)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

echo ""
echo "3️⃣ Verifying faster-whisper installation..."
pip install --upgrade faster-whisper

echo ""
echo "✅ Environment fixed!"
echo ""
echo "Now you can run:"
echo "  python dragon_integrated.py --model small.en --device cpu --compute_type int8"
echo ""
echo "Or use the launch script:"
echo "  ./run_dragon.sh"