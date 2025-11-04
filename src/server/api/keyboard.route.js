/*****************************************************************************
#                                                                            #
#    blikvm                                                                  #
#                                                                            #
#    Copyright (C) 2021-present     blicube <info@blicube.com>               #
#                                                                            #
#    This program is free software: you can redistribute it and/or modify    #
#    it under the terms of the GNU General Public License as published by    #
#    the Free Software Foundation, either version 3 of the License, or       #
#    (at your option) any later version.                                     #
#                                                                            #
#    This program is distributed in the hope that it will be useful,         #
#    but WITHOUT ANY WARRANTY; without even the implied warranty of          #
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the           #
#    GNU General Public License for more details.                            #
#                                                                            #
#    You should have received a copy of the GNU General Public License       #
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.  #
#                                                                            #
*****************************************************************************/

import { ApiCode, createApiObj } from '../../common/api.js';
import Keyboard from '../keyboard.js';
import KeyboardProcessor from '../../modules/hid/keyboard_processor.js';
import { makeKeyboardEvent } from '../../modules/hid/event.js';
import { KEYMAP } from '../../modules/hid/mapping.js';

// Keep a tiny stateful processor so modifier states persist across calls
const keyboardProcessor = new KeyboardProcessor();
const keyboard = new Keyboard();

function parseBoolean(value, defaultValue = undefined) {
	if (value === undefined || value === null) return defaultValue;
	const s = String(value).trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(s)) return true;
	if (['0', 'false', 'no', 'off'].includes(s)) return false;
	return defaultValue;
}

/**
 * Send a single key event
 * Method: POST
 * Route: /api/hid/events/send_key
 * Query parameters:
 *  - key: string (required) — KeyboardEvent.code-like identifier (e.g., KeyA, Enter)
 *  - state: boolean (optional) — true: press, false: release; if omitted, treated as press
 *  - finish: boolean (optional) — when true and state is press for a non-modifier, immediately release
 */
function apiSendKeyEvent(req, res, next) {
	try {
		const ret = createApiObj();

		// Accept from query first (as requested), but also allow body fallbacks
		const key = (req.query.key ?? req.body?.key);
		let state = parseBoolean((req.query.state ?? req.body?.state), undefined);
		const finish = parseBoolean((req.query.finish ?? req.body?.finish), false);

		if (typeof key !== 'string' || !key) {
			ret.code = ApiCode.INVALID_INPUT_PARAM;
			ret.msg = 'missing or invalid key parameter';
			return res.json(ret);
		}

		if (!Object.prototype.hasOwnProperty.call(KEYMAP, key)) {
			ret.code = ApiCode.INVALID_INPUT_PARAM;
			ret.msg = `unsupported key: ${key}`;
			return res.json(ret);
		}

		// Default behavior: press
		if (state === undefined) state = true;

		// Build and send the event
		const event = makeKeyboardEvent(key, state);
		const report = keyboardProcessor.processEvent(event);
		if (report) keyboard.writeToQueue(report);

		// If finish=true and it's a press on a non-modifier, send a release right away
		const isModifier = KEYMAP[key].usb.isModifier === true;
		if (finish === true && state === true && !isModifier) {
			const releaseEvent = makeKeyboardEvent(key, false);
			const releaseReport = keyboardProcessor.processEvent(releaseEvent);
			if (releaseReport) keyboard.writeToQueue(releaseReport);
		}

		ret.code = ApiCode.OK;
		ret.msg = 'key event sent';
		ret.data = { key, state, finish, isModifier };
		return res.json(ret);
	} catch (err) {
		return next(err);
	}
}

export { apiSendKeyEvent };

