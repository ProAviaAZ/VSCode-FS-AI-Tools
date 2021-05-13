# **FS AI** Tools

A handful of tools to format and clean up `Aircraft.cfg`, `Aircraft_….txt`, `Flightplans_….txt`, `add-ons.cfg` and `scenery.cfg` files. All options are configurable in the extension settings.

## Features

### Clean Aircraft.cfg
* Renumber `fltsim.x` entries
* Convert `atc_airline` callsigns to uppercase
* Remove unnecessary lines:
  * `atc_flight_number=…`
  * `atc_heavy=0` (only `0`, not `1`)
  * `atc_id=` (if no reg is set)
  * `atc_id_color=…`
  * `visual_damage=…`
* Sort entry property lines (not configurable yet)

### Clean Flightplans_….txt
* Add leading zeroes to flightnumbers so they have 4 digits (`12` ➞ `0012`)
* Add leading zeroes to flight levels so they have 3 digits (`70` ➞ `070`)
* Add `@` to departure times (`3/14:31` ➞ `@3/14:31`)
* Remove seconds from flight times (`hh:mm:ss` ➞ `hh:mm`)
* Convert the flightplan to uppercase
* Randomize the flight percentages to between configurable min and max values
* Change definable airport codes to new ones

### Change AC# Number
Changes the AC# of the selected `Aircraft_….txt` or `Flightplans_….txt` lines by a user specified amount.

### Create Flightplan Header
Uses a series of text input boxes to created a three-line header with flightplan data (name, icao, callsign, author, season). Tries to read the airline name and ICAO code from the filename.

Preview:
```js
//FSXDAYS=FALSE
//DC Aviation | DCS | "TWIN STAR"
//Morten Blindheim, Su19
```

### Renumber add-ons.cfg
Renumbers the `[Package.x]` entries sequentially.

### Renumber scenery.cfg
Renumbers the `[Area.xxx]` entries sequentially and sets the `Layer=x` properties to the same number.

---

## Known Issues

*none*

---

## Release Notes

### 1.0.11
- New function: `Create aifp.cfg File`. Creates an aifp.cfg file in the flightplan's folder, based on flightplan header information (i.e. `Create Flightplan Header`).<br />
  Formatting:
  ```js
  //FSXDAYS=FALSE
  //Irish Air Corps | IRL | "IRISH"/"SHADOW"
  //Phil Evans, Wi2021
  ```
  If multiple callsigns are defined, the first one is used.

### 1.0.10
- New function: `Rebase AC#s`. Rebases the AC#s in the selected text to a new input number. Every different AC# will be based on the initial start value, with a user defined step size.

### 1.0.9
- `Change airports`: each airport set can now be entered as a separate item (replacing the "one long string" idea from the olden times). The min supported VS Code version has been increased to 1.37.0 for this to work.

### 1.0.8
- Added an option to move `ui_createdby` to the bottom when sorting `fltsim` entries during cleaning `aircraft.cfg` files.
- New function: `Create Flightplan Header`. Uses a series of text input boxes to created a three-line header with flightplan data (name, icao, callsign, author, season).
  Preview:
  ```js
  //FSXDAYS=FALSE
  //DC Aviation | DCS | "TWIN STAR"
  //Morten Blindheim, Su19
  ```

### 1.0.7
- Added an option to replace airport ICAO codes with new ones in `Flightplans.txt` files as part of the `Clean Flightplan` command. Check the extension settings for more info.

### 1.0.6

- `Renumber scenery.cfg` added. Renumbers the `[Area.xxx]` entries sequentially and sets the `Layer=x` properties to the same number.
- `Renumber add-ons.cfg` added. Renumbers the `[Package.x]` entries sequentially.

### 1.0.5

- `Clean Aircraft.cfg` rewritten completely, can now take care of empty lines and sort entry lines.

### 1.0.4

- All options are now configurable in the extension settings.

### 1.0.3

- *Clean Flightplan* now also pads flight levels to 3 digits (`70` becomes `070`).

### 1.0.2

- *Clean Aircraft.cfg* now also removes `atc_flight_number=…` and `atc_id=`

### 1.0.1

- Context menu commands limited to corresponding file name/type (i.e. *Clean Aircraft.cfg* limited to `aircraft.cfg` files, *Clean Flightplans* to `flightplans_...txt` files etc.)

### 1.0.0

- Initial release. Includes *Clean Aircraft.cfg*, *Clean Flightplan* and *Change AC# Number*
