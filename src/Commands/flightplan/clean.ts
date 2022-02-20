import * as vscode from 'vscode';
import { getRandomInt, getFilenameFromPath } from '../../Tools/helpers';
import '../../Extenders/number';

export function CleanFlightplan() {
	const config = vscode.workspace.getConfiguration('fs-ai-tools.cleanFlightplan', undefined);

	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const document = editor.document;
		const filename = getFilenameFromPath(document.uri.path).toLocaleLowerCase();
		if ('file' === document.uri.scheme && filename.startsWith('flightplans')) {
			let text = document.getText();

			// Change airports
			let airportList = config.changeAirports;
			if (airportList && airportList !== null && airportList.length > 0) {
				for (let set of airportList) {
					set = set.split(':').map((icao: string) => icao.trim().toUpperCase());

					if (set[0].length > 2 && set[1].length > 2) {
						let old = new RegExp(`,${set[0]}`, 'gi');
						text = text.replace(old, `,${set[1]}`);
					}
				}
			}

			const commentsNumSpaces =
				config.adjustComments === '1 space' ? 1 : config.adjustComments === 'No space' ? 0 : -1;

			const ret = [];
			const splitData = text.trim().split('\n');
			for (let line of splitData) {
				if (line.startsWith('AC#') || line.startsWith('ac#') || line.startsWith('//#')) {
					if (config.removeSeconds || config.addAtToArrivalTimes) {
						line = formatTimes(line, config.removeSeconds, config.addAtToArrivalTimes);
					}

					if (config.randomPercentages) {
						line = randomizePercentage(line, config.randomPercentagesMin, config.randomPercentagesMax);
					}

					if (config.uppercase) {
						line = transformToUppercase(line);
					}

					if (config.leadingZeroesFlightnumbers) {
						line = padFlightNumbers(line);
					}

					if (config.leadingZeroesFlightLevels) {
						line = padFlightLevels(line);
					}
				}

				// Adjust comments
				if (commentsNumSpaces > -1 && line.trimStart().startsWith('//')) {
					line = changeComments(line, commentsNumSpaces);
				}

				ret.push(line);
			}
			ret.push('');
			const fp = ret.join('\n');

			// Apply changes to document
			editor.edit((editBuilder) => {
				editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 5000), fp);
			});
			vscode.window.showInformationMessage('Flightplan cleaned');
		}
	}
}

/**
 * If `removeSeconds` is true: changes an `hh:mm:ss` time to `hh:mm`.
 * If `addAtToDepTimes` is true: changes departure `d/hh:mm` times to `@d/hh:mm`.
 * Returns the complete string.
 * @test https://regex101.com/r/zTB7O2/8
 */
function formatTimes(text: string, removeSeconds: boolean, addAtToDepTimes: boolean): string {
	const regex = /((?:\d{1}\/)?\d{2}:\d{2})(:\d{2})?,@?((?:\d{1}\/)?\d{2}:\d{2})(:\d{2})?/gi;
	let subst;
	if (removeSeconds && !addAtToDepTimes) {
		subst = '$1,$4';
	} else if (!removeSeconds && addAtToDepTimes) {
		subst = '$1$2,@$3$4';
	} else {
		subst = '$1,@$3';
	}
	text = text.replace(regex, subst);
	return text;
}

/**
 * Randomizes the flightplan percentage between the provided min and max values (default `min=10` and `max=99`). Returns the complete string.
 */
function randomizePercentage(text: string, min: number = 10, max: number = 99): string {
	const regex = /(\d+%)/g;
	if (min === max) {
		return text.replace(regex, `${min}%`);
	}
	return text.replace(regex, (v) => {
		return `${getRandomInt(min, max)}%`;
	});
}

/**
 * Transforms the flightplan to uppercase. Returns the complete string.
 */
function transformToUppercase(text: string): string {
	return text.toUpperCase();
}

/**
 * Pads the flightnumbers to a `0000` format. Returns the complete string.
 */
function padFlightNumbers(text: string): string {
	text = text.replace(/,([FfRr]{1}),(\d+)/gi, (fullMatch, g1, g2) => {
		return `,${g1},${Number(g2).pad(4)}`;
	});
	return text;
}

/**
 * Pads the flight levels to a `000` format. Returns the complete string.
 */
function padFlightLevels(text: string): string {
	text = text.replace(/,(\d+),([FfRr]{1})/gi, (fullMatch, g1, g2) => {
		return `,${Number(g1).pad(3)},${g2}`;
	});
	return text;
}

/**
 * Adds a single space / removes all spaces after comment start "//"
 * @1 space: https://regex101.com/r/kmRPUa/1
 * @0 spaces: https://regex101.com/r/iKJTud/1/
 */
function changeComments(text: string, numSpaces: number = 1): string {
	if (numSpaces > 0) {
		text = text
			.replace(/^(\s*?)\/\/(\s*?)(\S)/, (fullMatch, g1, g2, g3) => {
				return `${g1}//${' '.repeat(numSpaces) + g3}`;
			})
			.replace('// FSXDAYS', '//FSXDAYS');
	} else {
		text = text.replace(/^(\s*?)\/\/(\s+)/, (fullMatch, g1, g2) => {
			return g1 + '//';
		});
	}
	return text;
}