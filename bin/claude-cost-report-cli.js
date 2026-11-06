#!/usr/bin/env node
'use strict';

const { main } = require('../src/index.js');

process.exitCode = main(process.argv.slice(2));
