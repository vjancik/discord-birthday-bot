export interface AnnouncementPublisher {
	publishBirthday(content: string, signal: AbortSignal): Promise<void>;
}
