export class AppError extends Error {
	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class InvalidBirthDateError extends AppError {}

export class InvalidTimezoneError extends AppError {
	constructor(input: string) {
		super(
			`Could not recognize timezone "${input}". Try a city name like "Prague" or an IANA zone like "Europe/Prague".`,
		);
	}
}

export class BirthdayNotFoundError extends AppError {
	constructor(userId: string) {
		super(`No birthday configured for user ${userId}.`);
	}
}

export class MissingEnvVarError extends AppError {
	constructor(names: string[]) {
		super(`Missing required environment variables: ${names.join(", ")}`);
	}
}

export class ConfigError extends AppError {}
