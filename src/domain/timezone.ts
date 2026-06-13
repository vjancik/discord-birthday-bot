import { InvalidTimezoneError } from "./errors.ts";

const MANUAL_ALIASES: Record<string, string> = {
	uk: "Europe/London",
	"great britain": "Europe/London",
	england: "Europe/London",
	czechia: "Europe/Prague",
	"czech republic": "Europe/Prague",
	"usa eastern": "America/New_York",
	"usa central": "America/Chicago",
	"usa mountain": "America/Denver",
	"usa pacific": "America/Los_Angeles",
	korea: "Asia/Seoul",
	"south korea": "Asia/Seoul",
	japan: "Asia/Tokyo",
	china: "Asia/Shanghai",
	india: "Asia/Kolkata",
	australia: "Australia/Sydney",
	"new zealand": "Pacific/Auckland",
	brazil: "America/Sao_Paulo",
	mexico: "America/Mexico_City",
	turkey: "Europe/Istanbul",
	russia: "Europe/Moscow",
	egypt: "Africa/Cairo",
	"south africa": "Africa/Johannesburg",
	nigeria: "Africa/Lagos",
	kenya: "Africa/Nairobi",
	argentina: "America/Argentina/Buenos_Aires",
	colombia: "America/Bogota",
	chile: "America/Santiago",
	peru: "America/Lima",
	venezuela: "America/Caracas",
	canada: "America/Toronto",
	singapore: "Asia/Singapore",
	"hong kong": "Asia/Hong_Kong",
	taiwan: "Asia/Taipei",
	thailand: "Asia/Bangkok",
	vietnam: "Asia/Ho_Chi_Minh",
	philippines: "Asia/Manila",
	indonesia: "Asia/Jakarta",
	malaysia: "Asia/Kuala_Lumpur",
	pakistan: "Asia/Karachi",
	bangladesh: "Asia/Dhaka",
	"sri lanka": "Asia/Colombo",
	uae: "Asia/Dubai",
	"saudi arabia": "Asia/Riyadh",
	israel: "Asia/Jerusalem",
	iran: "Asia/Tehran",
	ukraine: "Europe/Kyiv",
	poland: "Europe/Warsaw",
	germany: "Europe/Berlin",
	france: "Europe/Paris",
	spain: "Europe/Madrid",
	italy: "Europe/Rome",
	netherlands: "Europe/Amsterdam",
	belgium: "Europe/Brussels",
	switzerland: "Europe/Zurich",
	austria: "Europe/Vienna",
	sweden: "Europe/Stockholm",
	norway: "Europe/Oslo",
	denmark: "Europe/Copenhagen",
	finland: "Europe/Helsinki",
	greece: "Europe/Athens",
	portugal: "Europe/Lisbon",
	romania: "Europe/Bucharest",
	hungary: "Europe/Budapest",
};

let cityMap: Map<string, string> | null = null;

function getCityMap(): Map<string, string> {
	if (cityMap !== null) return cityMap;

	const map = new Map<string, string>();
	const zones = Intl.supportedValuesOf("timeZone");

	for (const zone of zones) {
		const parts = zone.split("/");
		const city = parts[parts.length - 1];
		if (city === undefined) continue;
		const normalized = city.toLowerCase().replace(/_/g, " ");
		if (!map.has(normalized)) {
			map.set(normalized, zone);
		}
	}

	cityMap = map;
	return map;
}

export class Timezone {
	readonly ianaId: string;

	private constructor(ianaId: string) {
		this.ianaId = ianaId;
	}

	static resolve(input: string): Timezone {
		const trimmed = input.trim();

		// 1. Exact case-insensitive match against supported zones
		const zones = Intl.supportedValuesOf("timeZone");
		const lowerInput = trimmed.toLowerCase();
		for (const zone of zones) {
			if (zone.toLowerCase() === lowerInput) {
				return new Timezone(zone);
			}
		}

		// 2. Manual alias map
		const aliasMatch = MANUAL_ALIASES[lowerInput];
		if (aliasMatch !== undefined) {
			return new Timezone(aliasMatch);
		}

		// 3. City match (last segment of zone path, underscore→space)
		const map = getCityMap();
		const cityMatch = map.get(lowerInput);
		if (cityMatch !== undefined) {
			return new Timezone(cityMatch);
		}

		throw new InvalidTimezoneError(trimmed);
	}

	toString(): string {
		return this.ianaId;
	}
}
