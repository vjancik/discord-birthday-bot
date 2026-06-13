export const MODAL_FIELD_DAY_MONTH = "bday-daymonth";
export const MODAL_FIELD_YEAR = "bday-year";
export const MODAL_FIELD_TIMEZONE = "bday-timezone";

export function birthdayAddModalId(nonce: string): string {
	return `bday-add:modal:${nonce}`;
}

export function birthdayAddUpdateYesId(nonce: string): string {
	return `bday-add:update-yes:${nonce}`;
}

export function birthdayAddUpdateNoId(nonce: string): string {
	return `bday-add:update-no:${nonce}`;
}

export function birthdayRemoveYesId(nonce: string): string {
	return `bday-remove:yes:${nonce}`;
}

export function birthdayRemoveNoId(nonce: string): string {
	return `bday-remove:no:${nonce}`;
}
