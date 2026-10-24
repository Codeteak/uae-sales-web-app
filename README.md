# Ledger CRM

## Team onboarding

1. Register and confirm your email. The first registered account is the administrator.
2. Subsequent members request access; the administrator activates them under Admin settings → Team.
3. Create a lead with its company, contacts, owner and optional follow-up task. Missing dates remain explicitly flagged.
4. Record actual customer calls, emails, meetings or messages. Internal notes do not count as customer contact.
5. Complete or reschedule tasks. To deactivate a colleague, transfer their open work in the same access change.

## Backup and recovery

- Export leads, companies and contacts regularly. CSV exports are reference copies, not complete backups: tasks, history, permissions and notifications are not included.
- Archive rather than delete important sales records. Administrators can show archived records and restore them.
- Before bulk imports, export existing records; review the preview and possible duplicates. Imports never merge existing records.
- Ask Lovable support about available database backup and restore options before relying on point-in-time recovery; automatic recovery has not been verified for this project.

## Current limitations

- Reminder scheduling is installed, but signed-out delivery and repeat-event behavior still need a live scheduler verification.
- Team approval and work transfer use existing protected operations; multi-user permission testing still needs a second account.
- Lead CSV import is not included; company and contact CSV import/export and lead export are available.
- Adding or switching contacts within an existing opportunity is not fully transactional yet; avoid simultaneous changes to its primary contact.
- Date-entry controls currently use Dubai time. Per-user timezone preferences are not yet wired throughout the app.
- Reports aggregate opportunity counts and open value by currency; no exchange-rate conversion is performed.
- Verification records are clearly labeled QA and archived after testing; their audit history remains intentionally visible.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
