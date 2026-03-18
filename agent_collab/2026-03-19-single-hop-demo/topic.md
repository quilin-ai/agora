# Topic

## Discussion

Validate `single_hop_only` behavior for a local agent collaboration handoff

## Goals

- Run one real external handoff to Claude
- Verify that the target can answer directly without claiming hidden downstream delegation
- Verify that constrained write access still works through visible proxy-recorded flow

## Hard Requirements

- All inter-agent communication must be human-visible and logged
- No fabricated `pickup` entry
- The target must be asked to operate in `single_hop_only`
- If the target cannot write collaboration files, that limitation must be stated explicitly

## Current Constraints

- Prior rehearsal showed Claude can answer through CLI but may not be able to write `agent_collab/`
- Hidden downstream delegation cannot be directly verified, so the test relies on explicit instruction plus explicit self-report
- This is a protocol rehearsal, not a code review

## Scope

- In scope: single-hop prompt wording, visible capability declaration, proxy-recorded fallback if needed
- Out of scope: code changes, protocol checksum implementation, hidden-agent forensics beyond explicit self-report
