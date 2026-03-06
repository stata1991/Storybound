1. Before writing any code, describe your approach and wait for approval.

2. If the requirements I give you are ambiguous, ask clarifying questions before writing any code.

3. After you finish writing any code, list the edge cases and suggest test cases to cover them.

4. If a task requires changes to more than 3 files, stop and break it into smaller tasks first.

5. When there’s a bug, start by writing a test that reproduces it, then fix it until the test passes.

6. Every time I correct you, reflect on what you did wrong and come up with a plan to never make the same mistake again.

7. Never install a new dependency without telling me what it does  and why it's needed over a simpler alternative.

8. Always use the data models in /storybound-kb/specs/data-models.md as the source of truth for schema. If you need to deviate,ask first.

9. When building any pipeline or workflow, design it as an agent loop with evaluation steps — not a linear sequence of function calls. Every generation step must have a quality check before proceeding.