/**
 * @module logging
 */

import { Logging } from './Logging';
import { NgLogEngine } from './engines/NgLogEngine/NgLogEngine';
import { ConsoleEngine } from './engines/ConsoleEngine';

export * from './interfaces';

export { Logging, ConsoleEngine, NgLogEngine };
