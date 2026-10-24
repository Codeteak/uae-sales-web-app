<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- CRM browser reads and writes use the generated authenticated client and database RLS; transactional multi-record operations use authenticated database RPCs to prevent partial records.
- Shared query options live in src/lib/crm-data.ts and protected leaf loaders prefetch them; components use the same query cache for consistent refreshes.
- Optimistic concurrency uses each editable record's updated_at in update predicates; zero matched rows must prompt a refresh rather than silently succeeding.
- Reusable CRM forms and list tools live under src/components/crm; route files own page composition and unique metadata.
- CRM report aggregates keep currencies separate and exclude archived opportunities; pure summary and import validation helpers are tested independently of network access.
