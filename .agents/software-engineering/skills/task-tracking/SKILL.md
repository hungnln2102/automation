---
name: Task Tracking
description: Always mark completed steps in task.md after finishing work
---

# Task Tracking Skill

## Rule

**After completing any step listed in `task.md`, you MUST immediately update the task file to reflect the new status.**

## How

1. When you finish implementing a step (code written, verified working):
   - Change `[ ]` → `[x]` for completed items
   - Change `[ ]` → `[/]` for in-progress items
2. Do this **immediately** after the work is done, before moving to the next step or responding to the user.
3. If sub-tasks exist, mark them individually as well.

## Example

Before:
```markdown
- [ ] Bước 4: Logic xóa đơn hết hạn khỏi mapping
- [ ] Bước 5: Logic re-add user
```

After completing Bước 4:
```markdown
- [x] Bước 4: Logic xóa đơn hết hạn khỏi mapping
- [ ] Bước 5: Logic re-add user
```

## Important

- Never skip this step — the user relies on `task.md` to track progress.
- If a step is partially done, use `[/]` instead of `[x]`.
- Add brief notes after the checkbox if relevant (e.g., file names changed, issues found).
