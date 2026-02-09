---
'@nuwa-ai/identity-kit': minor
---

Release `nuwa-id` CLI workflow for remote DIDAuth usage on `id.nuwa.dev`.

Key updates:
- Add profile-based config layout and `set-did` command for smoother agent UX.
- Unify key fragment naming and improve generated deep link payload compatibility.
- Extract environment-agnostic deeplink/auth helpers shared by CLI and web paths.
- Improve DID verification defaults and remove misleading hardcoded RPC fallback.

