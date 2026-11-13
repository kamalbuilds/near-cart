#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
python3 spikes/chain-signatures/probe.py
