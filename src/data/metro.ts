// Arena city → metro area, for the back-to-back plane. The feed names the city of the arena itself, which for two
// arenas is a suburb or borough of a metro another team plays in: the Clippers' Intuit Dome is in Inglewood (LA),
// the Nets' Barclays Center in Brooklyn (New York). Checked against all 30 teams' home arenas in the 2026-27 feed;
// every other team's home city is the only one in its metro. Any city not listed is its own metro, so neutral
// sites (Mexico City, Paris, Austin, …) keep their city.

export const ARENA_METRO: Readonly<Record<string, string>> = {
  Inglewood: 'Los Angeles',
  Brooklyn: 'New York',
};

export const metroOf = (city: string) => ARENA_METRO[city] ?? city;
