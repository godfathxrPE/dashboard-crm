# Claude Code Guide

What Claude Code can and cannot do, and how to write prompts that work
within its constraints.

---

## What Claude Code Is

Claude Code is a command-line agent that:
- Reads a prompt (natural language + code instructions)
- Executes bash commands in the user's terminal
- Edits files using str_replace or full file creation
- Commits and pushes to git
- Installs dependencies
- Runs builds, tests, linters

It operates in the user's actual project directory with full filesystem access.

---

## What Claude Code Can Do Well

| Capability | Notes |
|-----------|-------|
| Read files | `cat`, `grep`, `find`, `head`, `tail`, `sed -n` |
| Edit files | `str_replace` (preferred) or rewrite sections |
| Create files | New files from scratch |
| Run bash | Any command the user's shell can run |
| Install packages | `npm install`, `pip install`, etc. |
| Git operations | add, commit, push, branch, stash |
| Run builds | `npm run build`, `cargo build`, etc. |
| Run tests | `npm test`, `pytest`, etc. |
| Database queries | Via CLI tools (`psql`, `supabase`, `sqlite3`) |
| HTTP requests | `curl`, `wget` |

---

## What Claude Code Cannot Do

| Limitation | Workaround |
|-----------|------------|
| No browser / no visual output | Describe expected visual result, verify via build |
| No persistent memory between sessions | Include all context in the prompt |
| No access to Supabase Dashboard UI | Provide SQL for manual execution |
| Cannot click / interact with running app | Verify via CLI, curl, build output |
| Limited context window | Use grep, not cat; targeted reads |
| Cannot run GUI applications | N/A |
| Cannot access cloud dashboards | Provide API commands or manual instructions |

---

## Environment

Claude Code runs in the user's local terminal:
- OS: macOS (Oleg's setup) or Linux
- Shell: zsh or bash
- Node.js: available
- Python: available
- Git: available
- Working directory: user's project root

---

## Prompt Best Practices

### 1. Context is everything

Claude Code has no memory. Every prompt must be self-contained.
Include:
- What the project is (one line)
- What stack it uses
- What you want changed
- Where the relevant files are
- What the current state is

### 2. Reconnaissance before changes

```bash
# Always start with diagnostic commands
grep -n "functionName" src/path/to/file.tsx | head -10
ls src/components/ | head -20
cat package.json | grep "dependency"
```

This prevents Claude Code from making changes based on assumptions.

### 3. Surgical file reads

```bash
# Bad — dumps entire file, wastes context
cat src/app/globals.css

# Good — finds exact location
grep -n "className" src/components/Card.tsx | head -10

# Good — shows specific range
sed -n '45,65p' src/components/Card.tsx

# Good — shows function block
sed -n '/function handleSubmit/,/^}/p' src/components/Form.tsx
```

### 4. str_replace with unique anchors

Claude Code's str_replace needs the old string to appear exactly once in
the file. Include enough context to make it unique:

```
# Bad — "return data" might appear 5 times
str_replace in src/lib/hooks/use-tasks.ts:
  old: "return data"
  new: "return data || []"

# Good — unique with surrounding lines
str_replace in src/lib/hooks/use-tasks.ts:
  old: |
    const { data, error } = await supabase
      .from('tasks')
      .select('*');
    return data;
  new: |
    const { data, error } = await supabase
      .from('tasks')
      .select('*');
    return data || [];
```

### 5. Escape hatches

Things fail. Provide alternatives:

```
Если файл не найден:
  find src -name "*Modal*" -type f

Если колонка уже существует (ошибка duplicate column):
  SQL уже применён, пропусти ЗАДАЧУ 1 и переходи к ЗАДАЧЕ 2.

Если npm run build падает с ошибкой X:
  Проверь [common cause] и [fix].
```

### 6. Verification after every change

```bash
# After editing TypeScript
npx tsc --noEmit 2>&1 | head -20

# After editing CSS
npm run build 2>&1 | tail -10

# After editing a specific file
grep -n "expected_pattern" modified_file.tsx

# After SQL migration
# (manual step — remind user to run in Supabase Dashboard)
```

### 7. Commit messages

Follow conventional commits when possible:

```
feat(scope): add new feature
fix(scope): fix specific bug
refactor(scope): restructure without behavior change
chore(scope): cleanup, config, deps
style(scope): formatting, no logic change
```

---

## Common Failure Modes

### 1. Stale context
**Symptom**: Claude Code edits a file that was already changed.
**Fix**: РАЗВЕДКА grep verifies current state before editing.

### 2. Non-unique str_replace
**Symptom**: "Multiple matches found" error.
**Fix**: Include more surrounding context in the old string.

### 3. Wrong file path
**Symptom**: "File not found" error.
**Fix**: РАЗВЕДКА `find` or `ls` verifies paths exist.

### 4. SQL applied after code
**Symptom**: Runtime errors because columns don't exist yet.
**Fix**: Always: SQL first → types → code. Mark SQL as ⚠️ manual step.

### 5. Missing dependency
**Symptom**: Build fails on import.
**Fix**: Include `npm install [package]` in prompt if new dependency needed.

### 6. Overly ambitious prompt
**Symptom**: Claude Code loses track, makes errors in later tasks.
**Fix**: Break into smaller prompts. Max 4-5 ЗАДАЧА blocks per prompt.

---

## Prompt Size Guidelines

| Complexity | Tasks | Prompt length | Strategy |
|-----------|-------|---------------|----------|
| Simple fix | 1-2 | Short (50-100 lines) | Single prompt |
| Medium feature | 3-4 | Medium (100-200 lines) | Single prompt |
| Large feature | 5+ | Long (200+ lines) | Split into 2-3 prompts |
| Full sprint | 6+ | Multiple prompts | Number them: Sprint 19.1, 19.2, 19.3 |

**Rule of thumb**: if a prompt has more than 5 ЗАДАЧА blocks, split it.
Claude Code performs better on focused prompts than on sprawling ones.

---

## Stack-Specific Tips

### Next.js / React
```bash
# Typecheck
npx tsc --noEmit

# Build
npm run build

# Find component usage
grep -rn "ComponentName" src/ --include="*.tsx" -l
```

### Supabase
```bash
# Check table exists (via types)
grep -n "table_name" src/types/database.ts

# SQL migrations: ALWAYS manual in Dashboard
# Include ⚠️ reminder in prompt
```

### Tailwind CSS
```bash
# Find class usage
grep -rn "className.*specific-class" src/ --include="*.tsx" | head -10

# Check config
cat tailwind.config.ts
```

### Python
```bash
# Typecheck
mypy src/ --ignore-missing-imports

# Test
pytest -v

# Lint
ruff check src/
```
