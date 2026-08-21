# Auth Testing Playbook

Refer to integration_playbook_expert_v2 output for full guide. Key testing steps:

1. Create test user & session via mongosh
2. Test backend `/api/auth/me` with Authorization: Bearer or session_token cookie
3. Test protected endpoints require session
4. Browser testing: set cookie, navigate

Endpoints:
- GET /api/auth/me — verify session, return user
- POST /api/auth/callback — exchange session_id for cookie
- POST /api/auth/logout — clear cookie & session
