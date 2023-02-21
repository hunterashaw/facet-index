export default class Lookup {
    /**
     * Create lookup from [id, name] entries
     * @param {[number, string][]} entries
     */
    constructor(entries) {
        this.idNames = Object.fromEntries(entries)
        this.nameIDs = Object.fromEntries(entries.map(([id, name]) => ([name, id])))
    }

    getName(id) {
        return this.idNames[id]
    }

    getID(name) {
        return this.nameIDs[name]
    }

    getNames() {
        return Object.keys(this.nameIDs)
    }

    getIDs() {
        return Object.keys(this.idNames)
    }
}