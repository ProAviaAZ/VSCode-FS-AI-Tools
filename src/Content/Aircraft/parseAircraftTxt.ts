import * as vscode from 'vscode';
import { merge } from 'lodash';
import { getFileContents, showError } from '../../Tools/helpers';
import * as _aircraftNaming from '../../data/aircraft-naming.json';
const aircraftNaming = _aircraftNaming as AircraftNaming;
import { TFlightplanFilesMetaData } from '../../Types/FlightplanFilesMetaData';
import { AircraftLivery, TAircraftLiveriesByAcNum } from './AircraftLivery';
import { AircraftType, TAircraftTypesByTypeCode } from './AircraftType';

/**
 * Collects each AC# entry in an aircraft.txt file, and matches it to an
 * aircraft type. Additionally, counts the number of aircraft using this AC# in
 * the corresponding flightplans.txt file.
 * @param data The flightplans meta data, which must include the files' contents
 * in their respective `text` variables.
 * @param doAircraftCount If `true`, performs a quick count of each
 * `AircraftLivery`'s AC# and saves it to its `manualCount` value.
 * @returns
 * • `aircraftTypes` = Map of type `TAircraftTypes` by ICAO type name. Each
 * entry has a set of `AircraftLivery` entries, as well as total count of
 * aircraft of this type.
 *
 * • `totalAircraftCount` = the total number of matched aircraft (not aircraft
 * types)
 *
 * • `nonMatches` = array of aircraft titles that couldn't be matched
 *
 * • `aircraftLiveries` = Map of type `TAircraftLiveriesByAcNum` by AC#. Each
 * entry
 *
 */
export async function parseAircraftTxt(data: TFlightplanFilesMetaData, doAircraftCount: boolean = false) {
	if (!data.aircraft.text) {
		showError(`parseAircraftTxt(): aircraft.txt contents must included in data argument.`);
		throw new Error(`parseAircraftTxt(): aircraft.txt contents must included in data argument.`);
	}
	if (!data.flightplans.text) {
		showError(`parseAircraftTxt(): flightplans.txt contents must included in data argument.`);
		throw new Error(`parseAircraftTxt(): flightplans.txt contents must included in data argument.`);
	}

	// 1. Get aircraft list from aircraft.txt file
	const liveries = getAircraftLiveries(data.aircraft.text);
	if (liveries.size === 0) {
		showError(`No aircraft found in "${data.aircraft.fileName}"`);
		return;
	}

	// 2. Count aircraft in flightplans.txt file
	if (doAircraftCount) {
		countAircraftSimple(liveries, data.flightplans.text);
	}

	// 3. Get aircraft type data (base and user data .json merged together)
	const aircraftTypeMetaData = await getAircraftTypeMetaData();

	// 4. Match titles to types
	const matchedData = matchTitleToType(aircraftTypeMetaData, liveries);

	return { ...matchedData, aircraftLiveries: liveries };
}

/**
 * Collects the aircraft entries in an aircraft.txt file and returns an
 * AC#→AircraftLivery map with that data.
 * @param text Aircraft.txt file contents
 * @returns A `TAircraftLiveriesByAcNum` map by AC#
 */
function getAircraftLiveries(text: string) {
	const ret: TAircraftLiveriesByAcNum = new Map();

	const matches = text.matchAll(/^AC#(?<acNum>\d+),\d+,\"(?<title>.*)\"/gm);
	if (matches) {
		for (const match of [...matches]) {
			const { acNum, title } = match.groups!;

			ret.set(Number(acNum), new AircraftLivery(Number(acNum), title));
		}
	}

	return ret;
}

/**
 * For each `AircraftLivery` entry, counts the number of occurring AC#s in a
 * flightplans.txt file and updates the `manualCount` value in the livery entry.
 * @param data The `TAircraftLiveriesByAcNum` map
 * @param flightplanText Flightplans.txt contents
 */
export function countAircraftSimple(data: TAircraftLiveriesByAcNum, flightplanText: string) {
	for (const [acNum, livery] of data.entries()) {
		const matches = flightplanText.match(new RegExp(`^AC#${acNum},`, 'gm'));

		if (matches) {
			livery.manualCount = matches.length;
			data.set(acNum, livery);
		}
	}
}

/**
 * Merges the user aicraft naming .json file with the base data
 * @returns a JSON object with the aircraft names and types.
 */
async function getAircraftTypeMetaData() {
	const config = vscode.workspace.getConfiguration('fs-ai-tools.showAircraftList', undefined);
	const customDataPath = config.get('customDataFilePath') as string;

	if (customDataPath?.length) {
		// Get custom file contents
		const customDataContents = await getFileContents(customDataPath);

		if (customDataContents) {
			const customData = JSON.parse(customDataContents);

			// Merge
			if (customData.list || customData.types) {
				return merge(aircraftNaming, customData);
			}

			showError(`Custom aircraft data couldn't be merged, as it has neither "list" nor "types"`);
		} else {
			showError(`Custom aircraft data couldn't be read. Please check file path.`);
		}
	}

	return aircraftNaming;
}

/**
 * Goes through `aircraftNaming` to match each title to an ICAO type name.
 *
 * Uses two methods to keep the iterations to a minimum:
 * 1. Keep a list of successful matches as well as their respective result,
 * and go through them for each aircraft title first to check for a possible
 * match
 * 2. Check for manufacturer match before deep-iterating through the
 * manufacturer's aircraft types
 * @param aircraftLiveries The `TAircraftLiveriesByAcNum` that includes all aircraft
 * liveries
 * @returns
 * • `aircraftTypes` = Map of type `TAircraftTypes` by ICAO type name. Each
 * aircraftType has a set of `AircraftLivery` entries, as well as total count
 * of aircraft of this type.
 *
 * • `totalAircraftCount` = the total number of matched aircraft (not
 * aircraft types)
 *
 * • `nonMatches` = array of aircraft titles that couldn't
 * be matched
 */
export function matchTitleToType(data: typeof aircraftNaming, aircraftLiveries: TAircraftLiveriesByAcNum) {
	const matches = new Map();
	const aircraftTypes: TAircraftTypesByTypeCode = new Map();
	let totalAircraftCount = 0;
	const nonMatches: string[] = [];

	const addOrUpdateAircraftData = (
		typeCode: string,
		aircraftLivery: AircraftLivery,
		manufacturerName?: string,
		typeName?: string,
		seriesName?: string
	) => {
		if (aircraftTypes.has(typeCode)) {
			// Already exists → add to that
			const aircraftType = aircraftTypes.get(typeCode);

			// Add livery to aircraftType
			aircraftType!.addLivery(aircraftLivery);
		} else {
			// Doesn't exist yet → create new AircraftType instance
			const aircraftType = new AircraftType(typeCode);
			if (manufacturerName) {
				aircraftType.manufacturer = manufacturerName;
			}
			if (typeName) {
				aircraftType.typeName = typeName;
			}
			if (seriesName) {
				aircraftType.series = seriesName;
			}

			// Add livery to aircraftType
			aircraftType.addLivery(aircraftLivery);

			aircraftTypes.set(typeCode, aircraftType);
		}

		// Update livery count
		totalAircraftCount += aircraftLivery.count;
	};

	titlesLoop: for (const [acNum, livery] of aircraftLiveries.entries()) {
		const title = livery.title.toLowerCase();

		// First check previous successful search terms to find a quick match
		for (const [searchTerm, typeName] of matches.entries()) {
			if (title.includes(searchTerm)) {
				addOrUpdateAircraftData(typeName, livery);
				continue titlesLoop;
			}
		}

		// Then, if nothing found, go through possible search terms
		for (const [manufacturer, manufacturerData] of Object.entries(data.types)) {
			for (const manufacturerName of manufacturerData.search) {
				if (title.includes(manufacturerName.toLowerCase())) {
					for (const [type, typeData] of Object.entries(manufacturerData.types)) {
						for (const searchTerm of typeData.search.map((searchTerm) => searchTerm.toLowerCase())) {
							let add = false;
							let matchTerm = searchTerm;

							// Regex
							if (searchTermIsRegex(searchTerm)) {
								const regex = new RegExp(searchTerm.slice(1, -1), 'i');
								const match = title.match(regex);

								if (match) {
									add = true;
									matchTerm = match[0];
								}

								// Regular search
							} else {
								add = title.includes(searchTerm);
							}

							if (add) {
								// Add data to aircraftTypes: create new or update existing
								addOrUpdateAircraftData(
									type,
									livery,
									manufacturer,
									typeData.name || type,
									typeData.series
								);

								// Add to successful matches
								if (!matches.has(matchTerm)) {
									matches.set(matchTerm, type);
								}

								continue titlesLoop;
							}
						}
					}
				}
			}
		}

		// Aircraft title couldn't be matched
		nonMatches.push(livery.title);
	}

	return { aircraftTypes, totalAircraftCount, nonMatches };
}

function searchTermIsRegex(term: string): boolean {
	return term.startsWith('/') && term.endsWith('/');
}
