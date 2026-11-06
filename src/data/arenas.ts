// Round 8 (2.5): where the feed's arenas are. One entry per venue the feed names (its arenaName, arenaCity, arenaState —
// the feed has no coordinates and no country field; abroad, arenaState holds the country code, or nothing). Coordinates:
// Wikidata's "coordinate location" (P625) of the arena's item, fetched 2026-10-30 (`source`: item @ revision); for the 10
// arenas whose Wikipedia article carries its own geotag, the two agree exactly. The Cup's Las Vegas arena (T-Mobile
// Arena) is here for the knockout games, which the feed only places once they're scheduled. A game whose arena isn't
// in this table is never guessed: the map shows it as "location unknown" (tests/map.test.ts checks every game of the
// season resolves, and every team's home arena is listed).

export interface Arena {
  arena: string;
  city: string;
  /** The feed's arenaState: a US state / Canadian province code, a country code abroad (MX, FR), or empty. */
  state: string;
  /** How to name the place when it isn't "City, ST" (abroad). */
  place?: string;
  lat: number;
  lon: number;
  source: string;
}

export const ARENAS: readonly Arena[] = [
  { arena: "Accor Arena", city: "Paris", state: "FR", place: "Paris, France", lat: 48.8391, lon: 2.37949, source: 'wikidata:Q537720@2532911393' },
  { arena: "American Airlines Center", city: "Dallas", state: "TX", lat: 32.79056, lon: -96.81028, source: 'wikidata:Q463345@2540986013' },
  { arena: "Arena CDMX", city: "Mexico City", state: "MX", place: "Mexico City, Mexico", lat: 19.49631, lon: -99.17543, source: 'wikidata:Q6826206@2559538162' },
  { arena: "Ball Arena", city: "Denver", state: "CO", lat: 39.74861, lon: -105.0075, source: 'wikidata:Q795470@2541967177' },
  { arena: "Barclays Center", city: "Brooklyn", state: "NY", lat: 40.68265, lon: -73.97469, source: 'wikidata:Q807966@2500586726' },
  { arena: "Capital One Arena", city: "Washington", state: "DC", lat: 38.89806, lon: -77.02083, source: 'wikidata:Q223240@2540602487' },
  { arena: "Chase Center", city: "San Francisco", state: "CA", lat: 37.76783, lon: -122.38739, source: 'wikidata:Q15262098@2540536652' },
  { arena: "Co-op Live", city: "Manchester", state: "", place: "Manchester, England", lat: 53.4865, lon: -2.19967, source: 'wikidata:Q111962681@2556376274' },
  { arena: "Crypto.com Arena", city: "Los Angeles", state: "CA", lat: 34.04306, lon: -118.26722, source: 'wikidata:Q186080@2534970065' },
  { arena: "Delta Center", city: "Salt Lake City", state: "UT", lat: 40.76833, lon: -111.90111, source: 'wikidata:Q82294@2541990658' },
  { arena: "FedExForum", city: "Memphis", state: "TN", lat: 35.13833, lon: -90.05056, source: 'wikidata:Q641212@2541751096' },
  { arena: "Fiserv Forum", city: "Milwaukee", state: "WI", lat: 43.0451, lon: -87.9182, source: 'wikidata:Q20372160@2540584398' },
  { arena: "Frost Bank Center", city: "San Antonio", state: "TX", lat: 29.42694, lon: -98.4375, source: 'wikidata:Q298573@2540659520' },
  { arena: "Gainbridge Fieldhouse", city: "Indianapolis", state: "IN", lat: 39.76389, lon: -86.15556, source: 'wikidata:Q545007@2541626149' },
  { arena: "Golden 1 Center", city: "Sacramento", state: "CA", lat: 38.58, lon: -121.5, source: 'wikidata:Q7011384@2541823826' },
  { arena: "Hinkle Fieldhouse", city: "Indianapolis", state: "IN", lat: 39.84361, lon: -86.1675, source: 'wikidata:Q3785713@2551062982' },
  { arena: "Intuit Dome", city: "Inglewood", state: "CA", lat: 33.94513, lon: -118.3431, source: 'wikidata:Q54958436@2561194491' },
  { arena: "Kaseya Center", city: "Miami", state: "FL", lat: 25.78139, lon: -80.18806, source: 'wikidata:Q420129@2530243970' },
  { arena: "Kia Center", city: "Orlando", state: "FL", lat: 28.53917, lon: -81.38361, source: 'wikidata:Q481795@2526090481' },
  { arena: "Little Caesars Arena", city: "Detroit", state: "MI", lat: 42.3412, lon: -83.0549, source: 'wikidata:Q18154984@2560086481' },
  { arena: "Madison Square Garden", city: "New York", state: "NY", lat: 40.7505, lon: -73.99345, source: 'wikidata:Q186125@2562724464' },
  { arena: "Moda Center", city: "Portland", state: "OR", lat: 45.53167, lon: -122.66667, source: 'wikidata:Q1347442@2540159655' },
  { arena: "Moody Center", city: "Austin", state: "TX", lat: 30.28097, lon: -97.73047, source: 'wikidata:Q79477138@2541966025' },
  { arena: "Mortgage Matchup Center", city: "Phoenix", state: "AZ", lat: 33.44583, lon: -112.07139, source: 'wikidata:Q1538690@2540537895' },
  { arena: "Paycom Center", city: "Oklahoma City", state: "OK", lat: 35.46333, lon: -97.515, source: 'wikidata:Q665434@2541770073' },
  { arena: "Rocket Arena", city: "Cleveland", state: "OH", lat: 41.49639, lon: -81.68806, source: 'wikidata:Q387157@2540947165' },
  { arena: "Scotiabank Arena", city: "Toronto", state: "ON", lat: 43.64333, lon: -79.37917, source: 'wikidata:Q406972@2513198505' },
  { arena: "Smoothie King Center", city: "New Orleans", state: "LA", lat: 29.94889, lon: -90.08194, source: 'wikidata:Q1515840@2489299033' },
  { arena: "Spectrum Center", city: "Charlotte", state: "NC", lat: 35.225, lon: -80.83917, source: 'wikidata:Q983870@2542030939' },
  { arena: "State Farm Arena", city: "Atlanta", state: "GA", lat: 33.75722, lon: -84.39639, source: 'wikidata:Q1123297@2540076364' },
  { arena: "Target Center", city: "Minneapolis", state: "MN", lat: 44.97944, lon: -93.27611, source: 'wikidata:Q282675@2540651214' },
  { arena: "TD Garden", city: "Boston", state: "MA", lat: 42.36639, lon: -71.06222, source: 'wikidata:Q432105@2540974206' },
  { arena: "Toyota Center", city: "Houston", state: "TX", lat: 29.75083, lon: -95.36222, source: 'wikidata:Q1166157@2540084534' },
  { arena: "United Center", city: "Chicago", state: "IL", lat: 41.88056, lon: -87.67417, source: 'wikidata:Q639975@2541750371' },
  { arena: "Xfinity Mobile Arena", city: "Philadelphia", state: "PA", lat: 39.90115, lon: -75.17197, source: 'wikidata:Q818735@2560741093' },
  { arena: "T-Mobile Arena", city: "Las Vegas", state: "NV", lat: 36.10292, lon: -115.17836, source: 'wikidata:Q3338973@2556598282' },
];
