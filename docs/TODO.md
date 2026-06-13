# TODO

- [ ] Add abuse prevention measures — warn the user their birthday can only be changed once every 2 weeks, also ensure a birthday announcement can only fire once per calendar year (or a more reasonable period, like 6 months?) per user (a `lastPostedYear` column or a check against `lastPostedAtUtc` local year would suffice).
- [ ] Check guild membership before posting a birthday announcement — skip or flag the message if the user has left the server.
- [ ] Add a `--no-discord` flag to the CLI scripts to skip the REST audit post (useful for offline maintenance or testing).
- [ ] Add rate-limit-aware queuing for REST posts to `BIRTHDAY_POST_CHANNEL` in case multiple birthdays fall on the same day.
- [ ] Validate that both configured channel IDs are reachable at startup and fail fast with a `ConfigError` if not.
- [ ] Add a `/next_birthday` slash command (admin-only or unrestricted, to be decided) that returns an ephemeral reply showing whose birthday is coming up next and on what date.
