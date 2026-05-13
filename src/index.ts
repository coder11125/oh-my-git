#!/usr/bin/env node
import { createProgram } from './cli.js';
import { handleNerdError } from './errors.js';

const program = createProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  handleNerdError(err);
  process.exit(1);
});
