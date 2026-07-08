# kamolliddin-cam

## Rule: Codex First

Hands-on kod yozish Codex CLI'ga delegatsiya qilinadi. Claude spec yozadi, review qiladi, verifikatsiya qiladi.

Sabab: Claude token'lari qimmat/hisoblanadi, Codex flat-rate. Codex yozadi, Claude o'ylaydi va tekshiradi.

### Codex'ga delegatsiya qil (default)
- frozen spec bo'yicha implementatsiya; refactor; mexanik migratsiya
- repro'si ma'lum bug fix; test yozish; coverage to'ldirish
- CI fix, dependency bump, script/tooling
- ko'p fayl o'qish kerak bo'lgan exploration

### Claude'da qol
- dizayn, API dizayn, arxitektura, naming, UX
- spec yozishning o'zi = ish bo'lgan tasklar (noaniqlik = dizayn)
- kichik edit (~<20 satr, bitta aniq o'zgarish) — delegatsiya overhead'i yutqazadi
- session tool'lar kerak bo'lsa: MCP (browser/computer-use), secrets
- destructive/qaytmas ops, release, push, GitHub mutatsiya
- Codex chiqishini review — hech qachon delegatsiya qilinmaydi, hech qachon o'tkazib yuborilmaydi

Aralash task: avval Claude dizayn qiladi, spec'ni muzlatadi, keyin build'ni delegatsiya qiladi.
Heuristika: prompt "work order"dek o'qilsa → delegatsiya; yozish qaror talab qilsa → Claude.

### Chaqirish
Prompt'ni temp fayl orqali ber, inline quoting emas:

```bash
P=$(mktemp); cat >"$P" <<'EOF'
<goal, repo + key paths, constraints ("X'ga tegma"), non-goals, kutilgan proof, output shape>
EOF
command codex exec --yolo --skip-git-repo-check -C /Users/asilbek/Documents/kamolliddin-cam \
  -c model_reasoning_effort="high" \
  -o /tmp/codex-last.md - <"$P" 2>/dev/null
```

- `--yolo` — default; Codex command/test'larni erkin ishlatadi.
- `--skip-git-repo-check` — bu dir hozircha git emas (git init qilingach olib tashla).
- stderr suppressed; debug uchun `2>/dev/null`ni olib tashla.
- natijani `-o` fayldan o'qi, JSONL stream'ni parse qilma.
- uzoq run: Bash run_in_background, tugagach `-o` faylni o'qi.

Follow-up fix (arzonroq, kontekstni saqlaydi) — repo dir'idan:

```bash
(cd /Users/asilbek/Documents/kamolliddin-cam && command codex exec resume --last \
  --dangerously-bypass-approvals-and-sandbox \
  -o /tmp/codex-last.md - <"$P2" 2>/dev/null)
```

### Prompt kontrakti
Codex'da nol session kontekst. Har prompt: goal, aniq repo/path'lar, constraints, non-goals, kutilgan proof (aniq test komandasi), output shape. Spec sifati muvaffaqiyatni hal qiladi.

### Verify (Claude, har doim)
- `git status -sb` + to'liq diff'ni o'qi; contributor PR'idek baho ber
- fokusli test'larni o'zing ishlat yoki proof talab qil; Codex da'volari advisory
- resume orqali iteratsiya; 2 muvaffaqiyatsiz round'dan keyin o'zing qil
- ship'dan oldin normal closeout
