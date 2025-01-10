/**********************************************************************************
 * Mineavganger storage API
 **********************************************************************************
 Stores an ordered list of departure objects.

 Departure object required shape:
 {
   id: <number>,
   placeFrom: {
     stopId: <string>
     name: <string>
   },
   placeTo: {
     stopId: <string>
     name: <string>
   },
   mode: <string>,
   numTrips: <number?>
 }
 */

'use strict';

/* Simple local browser storage of personal departures. */
const Storage = new function() {

    const db = window.localStorage;
    const self = this;
    
    const validateDeparture = d => {
        if (typeof d !== 'object') throw new TypeError('departure must be an object');

        if (typeof d.id !== 'number') {
            throw new TypeError('id must be a number');
        }

        if (typeof d.placeFrom !== 'object') {
            throw new TypeError('placeFrom not an object');
        }
        if (typeof d.placeFrom.stopId !== 'string' || typeof d.placeFrom.name !== 'string') {
            throw new TypeError('invalid contents in placeFrom');
        }

        if (typeof d.placeTo !== 'object') {
            throw new TypeError('placeTo not an object');
        }
        if (typeof d.placeTo.stopId !== 'string' || typeof d.placeTo.name !== 'string') {
            throw new TypeError('invalid contents in placeTo');
        }
        
        if (typeof d.mode !== 'string') {
            throw new TypeError('mode is not a string');
        }

        if (d.numTrips && (typeof d.numTrips !== 'number' || d.numTrips < 1)) {
            throw new TypeError('numTrips must be a positive number');
        }

        return d;
    };

    const setDeparturesLocalStorage = function(departures) {
        db.setItem('departures', JSON.stringify(departures));
        return departures;
    };

    const getDeparturesLocalStorage = function() {
        const jsonString = db.getItem('departures');
        try {
            return jsonString ? JSON.parse(jsonString) : [];
        } catch (err) {
            console.error(`Failed to load departures from local storage: ${err.message}, opening parachute`);
            return [];
        }
    };

    /* Returns all stored departures as an array. */
    this.getDepartures = function() {
        return getDeparturesLocalStorage().map(d => {
            try {
                return validateDeparture(d);
            } catch (err) {
                console.error(`Failed to validate a departure from storage: ${err.message}, removing it`);
                return null;
            }
        }).filter(d => d !== null);
    };

    /* Returns a single departure by id */
    this.getDeparture = function(id) {
        return self.getDepartures().find(d => d.id === id);
    };

    /* Saves a departure. Assigns an 'id' property automatically to object, if not
       already present. */
    this.saveDeparture = function(departure) {
        const list = self.getDepartures();
        if (!departure.id) {
            departure.id = list.map(function (d) {
                return d.id;
            }).reduce(function(max, n) {
                return n > max ? n : max;
            }, 0) + 1;
        }

        validateDeparture(departure);
        
        const updateIdx = list.findIndex(function(d) { return d.id === departure.id; });
        if (updateIdx > -1) {
            list[updateIdx] = departure;
        } else {
            list.push(departure);
        }
        setDeparturesLocalStorage(list);
        return departure;
    };

    /* Removes a departure by id, returns the removed departure. */
    this.removeDeparture = function(id) {
        var departureToRemove;
        setDeparturesLocalStorage(self.getDepartures().filter((d) => {
            if (id === d.id) {
                departureToRemove = d;
                return false;
            }
            return true;
        }));
        return departureToRemove;
    };

    const moveDeparture = function(departureId, first) {
        const departures = self.getDepartures();
        const departureToMove = departures.findIndex(function(d) { return d.id === departureId; });
        if (departureToMove > -1) {
            const departure = departures[departureToMove];
            departures.splice(departureToMove,1);
            if (first) {
                departures.unshift(departure);
            } else {
                departures.push(departure);
            }
            setDeparturesLocalStorage(departures);
            return departure;
        }
        return undefined;
    };

    /* Moves an existing departure to first position in list.
       Returns moved departure. */
    this.moveFirst = function(departureId) {
        return moveDeparture(departureId, true);
    };

    /* Moves an existing departure to last position in list.
       Returns moved departure. */
    this.moveLast = function(departureId) {
        return moveDeparture(departureId, false);
    };

    this.removeAll = function() {
        return setDeparturesLocalStorage([]);
    };
};
