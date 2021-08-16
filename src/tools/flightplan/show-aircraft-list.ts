import * as vscode from 'vscode';
import * as Fs from 'fs';
import * as Path from 'path';
import { getFileContents, plural, showError, writeTextToClipboard } from '../../helpers';
import * as aircraftNaming from '../../data/aircraft-naming.json';

interface aircraftDataRaw {
	title: string;
	count: number;
	acNum: number;
	icao?: string;
}
type aircraftListRaw = Map<number, aircraftDataRaw>;

interface aircraftData {
	name?: string;
	count: number;
	aircraft: Set<string>;
}
type aircraftList = Map<string, aircraftData>;

export async function ShowAircraftList() {
	/*
	1. Get aircraft list from current dir's aircraft file (map(acNum, acTitle))
	2. Count each acNum in current dir's flightplan file
	3. For each AC in map, try to get ICAO code (create new dictionary, sum up counts for matching ACs)
	4. Based on pre-defined excel sheet AC list, display tsv data
	*/

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const filePath = editor.document.uri.path;
	const dirPath = Path.dirname(filePath).replace(/^\/+/, '');

	// Get Aicraft…, Flightplans… filenames
	const files = await getFiles(dirPath);
	if (!(files.aircraft && files.flightplans)) {
		const name = !files.aircraft ? 'Aircraft' : 'Flightplans';
		showError(`${name}….txt file couldn't be found in current directory.`);
		return;
	}

	// 1. Get aircraft list from aircraft.txt file
	const aircraftListRaw = await getAircraftListRaw(files.aircraft);
	if (aircraftListRaw.size === 0) {
		showError(`"${files.aircraft}" couldn't be read`);
		return;
	}
	console.log({ aircraftListRaw });

	// 2. Count aircraft in flightplans.txt file
	const countSuccess = await countAircraft(aircraftListRaw, files.flightplans);
	if (!countSuccess) {
		showError(`Flightplans….txt file couldn't be read.`);
		return;
	}

	// 3. Match titles to types
	const { aircraftList, totalCount } = matchTitleToType(aircraftListRaw);

	// 4. Show formatted message with "copy" button
	vscode.window
		.showInformationMessage(
			getFormattedAircraftList(aircraftList, totalCount),
			{ modal: true },
			'Copy for Google Sheets'
		)
		.then((buttonText) => {
			if (buttonText) {
				const sheetsOutput = generateGoogleSheetsOutput(aircraftList);
				writeTextToClipboard(sheetsOutput, 'Google Sheets aircraft count copied to clipboard');
			}
		});
}

/**
 * Goes through the directory's files and returns the "Aicraft…" and "Flightplans…" filenames
 * @param dirPath The directory to search in
 * @returns Object `{ aircraft: string, flightplans: string }` with filenames. Single values can be undefined if not found.
 */
async function getFiles(dirPath: string) {
	const dirFilenames = await Fs.promises.readdir(dirPath);

	const [aircraft, flightplans] = dirFilenames
		.filter((name) => {
			const n = name.toLowerCase();
			return n.startsWith('aircraft') || n.startsWith('flightplans');
		})
		.sort()
		.map((filename) => Path.join(dirPath, filename));

	return { aircraft, flightplans };
}

/**
 * Collects the aircraft entries in an aircraft.txt file and returns an `aircraftListRaw` map with that data.
 * @param filePath Path to aircraft.txt file
 * @returns Map of type `aircraftListRaw` with collected aircraft data
 */
async function getAircraftListRaw(filePath: string) {
	const contents = await getFileContents(filePath);
	const ret: aircraftListRaw = new Map();

	if (contents) {
		for (const line of contents.split('\n').map((line) => line.trim())) {
			if (line?.length && line.startsWith('AC#')) {
				const items = line.split(',');
				const data: aircraftDataRaw = {
					acNum: Number(items[0].replace(/[^0-9]/g, '')),
					title: items[2].replace(/"/g, ''),
					count: 0,
				};
				ret.set(data.acNum, data);
			}
		}
	}

	return ret;
}

/**
 * Counts the different AC#s in a flightplans.txt file and updates the counts in the provided `aircraftListRaw`
 * @param list The `aircraftListRaw` received from `getAircraftListRaw()`
 * @param filePath Path to flightplans.txt file
 * @returns `true` if flightplans.txt file could be read an the aircraft were counted, otherwise `false`
 */
async function countAircraft(list: aircraftListRaw, filePath: string) {
	const contents = await getFileContents(filePath);
	if (!contents) {
		return false;
	}

	for (const [index, line] of contents
		.split('\n')
		.map((line) => line.trim())
		.entries()) {
		if (line?.length && line.startsWith('AC#')) {
			const items = line.split(',');
			const acNum = Number(items[0].replace(/[^0-9]/g, ''));

			if (!list.has(acNum)) {
				showError(`Flightplans line ${index + 1}: AC# ${acNum} doesn't exist in Aircraft.txt file`);
				continue;
			}

			const data = list.get(acNum);
			if (data) {
				data.count++;
				list.set(acNum, data);
			}
		}
	}

	return true;
}

/**
 * Goes through `aircraftNaming` to match each title to an ICAO type name.
 *
 * Uses two methods to keep the iterations to a minimum:
 * 1. Keep a list of successful matches as well as their respective result, and go through them for each aircraft title first to check for a possible match
 * 2. Check for manufacturer match before deep-iterating through the manufacturer's aircraft types
 * @param inputList The `aircraftListRaw` that includes all aircraft titles as well as counts
 * @returns An `aircraftList` Map where the ICAO type name is the key, and the count as well as the matching aircraft titles are the value object
 */
function matchTitleToType(inputList: aircraftListRaw) {
	const aircraftList: aircraftList = new Map();
	const matches = new Map();

	let totalCount = 0;

	const addOrUpdateAircraftData = (typeName: string, inputData: aircraftDataRaw) => {
		if (aircraftList.has(typeName)) {
			const data = aircraftList.get(typeName);
			if (data) {
				data.count += inputData.count;
				data.aircraft.add(inputData.title);
				aircraftList.set(typeName, data);
				totalCount += inputData.count;
			}
		} else {
			aircraftList.set(typeName, {
				count: inputData.count,
				aircraft: new Set([inputData.title]),
			});
			totalCount += inputData.count;
		}
	};

	titlesLoop: for (const [inputKey, inputData] of inputList.entries()) {
		const title = inputData.title.toLowerCase();

		// First check previous successful search terms to find a quick match
		for (const [searchTerm, typeName] of matches.entries()) {
			if (title.includes(searchTerm)) {
				addOrUpdateAircraftData(typeName, inputData);
				continue titlesLoop;
			}
		}

		// Then, if nothing found, go through possible typenames
		for (const [manufacturer, manufacturerData] of Object.entries(aircraftNaming.types)) {
			for (const manufacturerName of manufacturerData.names) {
				if (title.includes(manufacturerName.toLowerCase())) {
					for (const [typeName, subStrings] of Object.entries(manufacturerData.types)) {
						for (const subString of subStrings) {
							const subStringLow = subString.toLowerCase();
							if (title.includes(subStringLow)) {
								// Add typeName to aircraftListRaw
								inputData.icao = typeName;
								inputList.set(inputKey, inputData);

								// Add data to aircraftList: create new or update existing
								addOrUpdateAircraftData(typeName, inputData);

								// Add to successful matches
								if (!matches.has(subStringLow)) {
									matches.set(subStringLow, typeName);
								}

								continue titlesLoop;
							}
						}
					}
				}
			}
		}
	}

	return { aircraftList, totalCount };
}

function generateGoogleSheetsOutput(aircraftList: aircraftList) {
	return aircraftNaming.list
		.map((item) => (aircraftList.has(item) ? aircraftList.get(item)?.count || '' : ''))
		.join('\t');
}

function getFormattedAircraftList(aircraftList: aircraftList, totalCount: number): string {
	const output: string[] = [`${totalCount} aircraft`, ''];
	aircraftList.forEach((data, key) => {
		let text = `• ${data.name || key}: ${data.count}×`;
		if (data.aircraft.size > 1) {
			text += ` (${plural(data.aircraft.size, 'variation')})`;
		}
		output.push(text);
	});

	return output.join('\n');
}
