# APZ Legal — Functional End-User Test Cases

## Document Controls
| Field | Value |
|-------|-------|
| **Document** | Functional End-User Test Cases |
| **Application** | APZ Legal (Legal Practice Management System) |
| **API Spec** | `lib/api-spec/openapi.yaml` |
| **Date** | 2026-09-21 |
| **Scope** | Full application, all modules |

---

## Test Case Format
Each test case uses the following fields:

| Field | Description |
|-------|-------------|
| **TC-ID** | Unique test case identifier |
| **Title** | Short descriptive name |
| **Module** | Functional area under test |
| **Priority** | P1 (critical), P2 (high), P3 (medium), P4 (low) |
| **Preconditions** | State required before the test begins |
| **Steps** | Sequential user actions |
| **Expected Result** | Observable system response after the last step |
| **Pass Criteria** | What must be true for the test to pass |

---

## 1. AUTHENTICATION

### TC-AUTH-001
**Title** Successful login with valid credentials  
**Module** Authentication  
**Priority** P1  

**Preconditions** User exists with known email and password.  

**Steps**
1. Navigate to the login page.
2. Enter a valid email and password.
3. Click "Sign In".

**Expected Result**
- User is authenticated and redirected to their dashboard.
- An HTTP-only, Secure, SameSite cookie containing a JWT access token is set.
- A refresh token is issued and stored securely.

**Pass Criteria** Dashboard loads; cookie attributes are HttpOnly + Secure + SameSite; response returns `200 OK` with tokens.

---

### TC-AUTH-002
**Title** Failed login with wrong password  
**Module** Authentication  
**Priority** P2  

**Preconditions** User exists with known email.  

**Steps**
1. Navigate to the login page.
2. Enter a valid email and an incorrect password.
3. Click "Sign In".

**Expected Result**
- Login is rejected with a generic error message (e.g., "Invalid email or password").
- No tokens are issued.
- The attempt is recorded for lockout tracking.

**Pass Criteria** `401 Unauthorized`; error message does not distinguish between unknown user and wrong password.

---

### TC-AUTH-003
**Title** Account lockout after 5 failed attempts  
**Module** Authentication  
**Priority** P1  

**Preconditions** User exists with known email.  

**Steps**
1. Navigate to the login page.
2. Enter a valid email and incorrect password.
3. Repeat step 2 five times.

**Expected Result**
- After the 5th failed attempt, the account is locked.
- The user receives a notification that the account is locked and must wait before retrying (lockout duration: 15 minutes per the security configuration).
- Subsequent login attempts with correct credentials are rejected until the lockout expires.

**Pass Criteria** 6th attempt returns `423 Locked` or `429 Too Many Requests`; error indicates account lockout.

---

### TC-AUTH-004
**Title** Token refresh (access token rotation)  
**Module** Authentication  
**Priority** P2  

**Preconditions** User is logged in with a valid but expired access token and a valid refresh token cookie.  

**Steps**
1. Wait for the access token to expire (or simulate expiry).
2. Perform any authenticated request.
3. The system automatically uses the refresh token to obtain a new access token.

**Expected Result**
- A new access token is issued without requiring re-login.
- The refresh token may be rotated (old refresh token invalidated).
- The original refresh token cookie is updated if rotated.

**Pass Criteria** Authenticated request succeeds with renewed access token; cookie is refreshed.

---

### TC-AUTH-005
**Title** Logout invalidates the session  
**Module** Authentication  
**Priority** P1  

**Preconditions** User is logged in.  

**Steps**
1. Click "Logout" (or call `POST /auth/logout`).
2. Attempt to navigate to a protected page or make an authenticated request.

**Expected Result**
- The access and refresh token cookies are cleared/revoked.
- Further authenticated requests return `401 Unauthorized`.

**Pass Criteria** Cookies deleted; subsequent API calls return `401`.

---

### TC-AUTH-006
**Title** Authenticated request without tokens is rejected  
**Module** Authentication  
**Priority** P1  

**Preconditions** No valid session exists.  

**Steps**
1. Attempt any request to a protected endpoint (e.g., `GET /clients`).

**Expected Result**
- Request is rejected with `401 Unauthorized`.

**Pass Criteria** `401` returned.

---

### TC-AUTH-007
**Title** View and update own profile  
**Module** Authentication  
**Priority** P3  

**Preconditions** User is logged in.  

**Steps**
1. Navigate to "My Profile" or call `GET /auth/profile`.
2. Click "Edit".
3. Update name and/or other editable profile fields.
4. Click "Save".

**Expected Result**
- Profile details are saved and reflected in subsequent fetches.
- An audit log entry is created for the update.

**Pass Criteria** `GET /auth/profile` returns the updated data.

---

### TC-AUTH-008
**Title** Change own password  
**Module** Authentication  
**Priority** P2  

**Preconditions** User is logged in with known current password.  

**Steps**
1. Navigate to password change form.
2. Enter current password.
3. Enter new password (meets complexity requirements).
4. Confirm new password.
5. Submit.

**Expected Result**
- Password is changed successfully.
- All other active sessions are invalidated (user is logged out elsewhere).
- User is prompted to log in with the new password.

**Pass Criteria** New password works; old password fails.

---

## 2. CLIENTS

### TC-CLIENT-001
**Title** Create a new individual client  
**Module** Clients  
**Priority** P1  

**Preconditions** User is authenticated and on the Clients page.  

**Steps**
1. Click "New Client".
2. Select client type "Individual".
3. Fill in first name, last name, email, phone, and address.
4. Click "Save".

**Expected Result**
- The client is created and appears in the client list.
- The client detail view shows the entered information.
- An audit log entry is recorded.

**Pass Criteria** `POST /clients` returns `201`; client appears in list with correct details.

---

### TC-CLIENT-002
**Title** Create a new corporate client  
**Module** Clients  
**Priority** P1  

**Steps**
1. Click "New Client".
2. Select client type "Corporate".
3. Fill in company name, registration number, registered address, and contact person.
4. Click "Save".

**Expected Result**
- The corporate client is created with type "corporate".
- Billing rates can be configured for the client.

**Pass Criteria** `POST /clients` returns `201` with `type: corporate`; billing rate setup is available.

---

### TC-CLIENT-003
**Title** Search and filter clients  
**Module** Clients  
**Priority** P2  

**Preconditions** Multiple clients exist.  

**Steps**
1. Use the search bar to enter a name or part of a name.
2. Apply a client-type filter (e.g., "Corporate").
3. Clear filters.

**Expected Result**
- Search results are narrowed to matching clients.
- The type filter shows only clients of the selected type.
- Clearing filters restores the full list.

**Pass Criteria** `GET /clients?q=...&type=...` returns filtered arrays.

---

### TC-CLIENT-004
**Title** View and edit a client's details  
**Module** Clients  
**Priority** P2  

**Preconditions** At least one client exists.  

**Steps**
1. Click on a client from the list.
2. Click "Edit".
3. Modify a field (e.g., phone number).
4. Click "Save".

**Expected Result**
- The updated field is saved.
- The change is reflected on the client detail page.

**Pass Criteria** `PATCH /clients/{id}` returns `200` with updated data.

---

### TC-CLIENT-005
**Title** Delete a client  
**Module** Clients  
**Priority** P3  

**Preconditions** A client exists with no associated matters.  

**Steps**
1. Navigate to the client detail page.
2. Click "Delete Client".
3. Confirm deletion in the dialog.

**Expected Result**
- The client is removed from the system.
- A confirmation message is shown.

**Pass Criteria** `DELETE /clients/{id}` returns `204`; client no longer appears in list.

---

### TC-CLIENT-006
**Title** View client's FICA compliance status  
**Module** Clients / FICA  
**Priority** P1  

**Preconditions** A client exists.  

**Steps**
1. Navigate to a client's detail page.
2. Click the "FICA" tab.

**Expected Result**
- The FICA compliance status is displayed (e.g., "Pending", "Compliant", "Non-Compliant").
- A list of required documents and their statuses is shown.
- Expiry dates for documents are visible.

**Pass Criteria** `GET /clients/{id}/fica` returns status, required docs, and expiring documents.

---

### TC-CLIENT-007
**Title** Upload a FICA document for a client  
**Module** Clients / FICA  
**Priority** P1  

**Preconditions** User is on a client's FICA tab.  

**Steps**
1. Click "Upload FICA Document".
2. Select a document type (e.g., "ID Document").
3. Upload a file.
4. Enter an expiry date.
5. Click "Save".

**Expected Result**
- The document is uploaded and stored.
- The document appears in the FICA document list with status "Pending Verification".
- The client's overall FICA status may recalculate.

**Pass Criteria** `POST /clients/{id}/fica/documents` returns `201`; document appears in list.

---

### TC-CLIENT-008
**Title** FICA manual override by compliance officer  
**Module** Clients / FICA  
**Priority** P2  

**Preconditions** A client has FICA documents with "Pending Verification" status.  
**Role** Compliance officer or administrator.  

**Steps**
1. Navigate to the client's FICA tab.
2. Click "Override Compliance".
3. Select a compliance status (e.g., "Compliant" or "Non-Compliant").
4. Add a note explaining the override.
5. Submit.

**Expected Result**
- The FICA status is updated to the selected value.
- The override is recorded with a timestamp and the user who performed it.

**Pass Criteria** `POST /fica/manual-override` returns `200`; status changes; override is logged in FICA timeline.

---

### TC-CLIENT-009
**Title** View FICA expiring documents dashboard  
**Module** Clients / FICA  
**Priority** P2  

**Steps**
1. Navigate to the FICA dashboard or call `GET /fica/expiring`.
2. View documents expiring within the next 90 days.

**Expected Result**
- A list of FICA documents expiring soon is displayed.
- Documents are sorted by expiry date.
- Alerts are shown for documents that have already expired.

**Pass Criteria** `GET /fica/expiring` returns expiring documents with correct dates.

---

### TC-CLIENT-010
**Title** View a client's risk score  
**Module** Clients  
**Priority** P2  

**Preconditions** A client exists with associated matters and FICA data.  

**Steps**
1. Navigate to a client's detail page.
2. View the risk score display.

**Expected Result**
- A numeric risk score is displayed with a label (e.g., Low, Medium, High).
- Hovering or clicking reveals contributing factors.

**Pass Criteria** `GET /clients/{id}/risk-score` returns score and risk level.

---

### TC-CLIENT-011
**Title** View and manage a client's related parties  
**Module** Clients  
**Priority** P3  

**Preconditions** A client exists.  

**Steps**
1. Navigate to a client's detail page.
2. Click the "Related Parties" tab.
3. Click "Add Related Party".
4. Select an existing client or create a new one.
5. Define the relationship type (e.g., "Director", "Shareholder").

**Expected Result**
- The related party is linked to the client with the specified relationship.
- The relationship is displayed in the related parties list.

**Pass Criteria** `GET /clients/{id}/related-parties` returns linked parties; `POST` creates a new relationship.

---

### TC-CLIENT-012
**Title** Configure billing rates for a client  
**Module** Clients  
**Priority** P3  

**Preconditions** A client exists.  

**Steps**
1. Navigate to a client's detail page.
2. Click the "Billing Rates" tab.
3. Add a new rate (e.g., $300/hr for a specific practice area).
4. Save.

**Expected Result**
- The rate is saved and displayed in the billing rates table.
- Future time entries for this client and practice area use the configured rate.

**Pass Criteria** `GET /clients/{id}/billing` returns the configured rate.

---

### TC-CLIENT-013
**Title** View a client's activity timeline  
**Module** Clients  
**Priority** P3  

**Steps**
1. Navigate to a client's detail page.
2. Click the "Activity" tab.

**Expected Result**
- A chronological list of all activities related to the client is displayed (e.g., matter creation, invoice generation, FICA updates).
- Each activity shows a timestamp, user, and description.

**Pass Criteria** `GET /clients/{id}/activity` returns activity items.

---

## 3. MATTERS

### TC-MATTER-001
**Title** Create a new matter in lead status  
**Module** Matters  
**Priority** P1  

**Preconditions** User is authenticated; a client exists.  

**Steps**
1. Click "New Matter".
2. Select a client from the dropdown.
3. Enter a title and description.
4. Select a practice area.
5. Set risk level to "Medium".
6. Click "Create".

**Expected Result**
- The matter is created with status "lead".
- The matter appears in the matter list.
- The matter detail page shows all entered information.

**Pass Criteria** `POST /matters` returns `201` with `status: lead`.

---

### TC-MATTER-002
**Title** Transition a matter through its lifecycle statuses  
**Module** Matters  
**Priority** P1  

**Preconditions** A matter exists in "lead" status.  

**Steps**
1. Navigate to the matter detail page.
2. Click "Change Status" → "Conflict Check".
3. Click "Change Status" → "Approved".
4. Click "Change Status" → "Active".
5. Click "Change Status" → "Review".
6. Click "Change Status" → "Completed".
7. Click "Change Status" → "Closed".

**Expected Result**
- The matter status transitions through the lifecycle: lead → conflict_check → approved → active → review → completed → closed.
- Each transition is recorded in the timeline.
- Transitions are gated appropriately (e.g., cannot go to "Active" before "Approved").

**Pass Criteria** `PATCH /matters/{id}/status` succeeds for each valid transition; invalid transitions return `409 Conflict`.

---

### TC-MATTER-003
**Title** Cannot activate a matter before conflict clearance  
**Module** Matters  
**Priority** P1  

**Preconditions** A matter exists in "approved" status without a cleared conflict check.  

**Steps**
1. Attempt to transition the matter to "Active".

**Expected Result**
- The transition is rejected with an error message: "Conflict check must be cleared before activating a matter."

**Pass Criteria** `PATCH /matters/{id}/status` returns `409 Conflict` or `400 Bad Request`.

---

### TC-MATTER-004
**Title** View a matter's detail page and summary  
**Module** Matters  
**Priority** P2  

**Preconditions** A matter exists with documents, tasks, time entries, and billing data.  

**Steps**
1. Navigate to the matter detail page.
2. Click the "Summary" tab.

**Expected Result**
- The matter summary shows: title, client, practice area, status, risk level, assigned attorneys/collaborators, total time recorded, total billed, total outstanding, related documents count, open tasks count, and conflict clearance status.
- A timeline of all matter activities is visible.

**Pass Criteria** `GET /matters/{id}` returns complete details; `GET /matters/{id}/timeline` returns activity entries.

---

### TC-MATTER-005
**Title** Assign and manage matter assignees  
**Module** Matters  
**Priority** P2  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter detail page.
2. Click "Assignees".
3. Add a user as "Attorney" and another as "Collaborator".
4. Remove one assignee.

**Expected Result**
- Assigned users appear in the assignee list with their roles.
- Changes are reflected in the matter summary and personal workloads.

**Pass Criteria** `GET /matters/{id}/assignees` returns correct assignments.

---

### TC-MATTER-006
**Title** Export a matter package  
**Module** Matters  
**Priority** P3  

**Preconditions** A matter exists with documents and time entries.  

**Steps**
1. Navigate to the matter detail page.
2. Click "Export".
3. Select export options (include documents, time entries, invoices).
4. Click "Download".

**Expected Result**
- A ZIP package is generated and downloaded containing all selected matter data.
- The export is recorded in the audit log.

**Pass Criteria** `POST /matters/{id}/export` returns a file (ZIP); download completes.

---

### TC-MATTER-007
**Title** Search and list matters with filters  
**Module** Matters  
**Priority** P2  

**Preconditions** Multiple matters exist in various statuses.  

**Steps**
1. Navigate to the Matters page.
2. Use the search bar to find a matter by title.
3. Apply status filter "Active".
4. Apply practice area filter "Corporate".

**Expected Result**
- Search results narrow to matching matters.
- Filters display only matters matching all criteria.
- Result count updates dynamically.

**Pass Criteria** `GET /matters?q=...&status=active&practiceArea=...` returns filtered array.

---

### TC-MATTER-008
**Title** View the matter pipeline dashboard  
**Module** Matters / Dashboard  
**Priority** P2  

**Steps**
1. Navigate to the Dashboard.
2. View the "Matter Pipeline" widget.

**Expected Result**
- A visual pipeline (kanban or bar chart) shows matter counts at each lifecycle stage (lead, conflict_check, approved, active, review, completed, closed, archived).

**Pass Criteria** `GET /dashboard/matter-pipeline` returns stage counts.

---

## 4. DOCUMENTS

### TC-DOC-001
**Title** Upload a new document to a matter  
**Module** Documents  
**Priority** P1  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter's "Documents" tab.
2. Click "Upload Document".
3. Select a file from the local filesystem.
4. Enter a document name and select a type (e.g., "Contract").
5. Click "Upload".

**Expected Result**
- The document is uploaded and stored in secure storage (signed URL).
- The document appears in the matter's document list with status "draft".
- Metadata (filename, size, upload date) is captured.
- An audit log entry is recorded.

**Pass Criteria** `POST /matters/{matterId}/documents` returns `201`; document appears in list with `status: draft`.

---

### TC-DOC-002
**Title** View document versions and restore a previous version  
**Module** Documents  
**Priority** P2  

**Preconditions** A document has multiple versions.  

**Steps**
1. Navigate to a document's detail page.
2. Click the "Versions" tab.
3. Click "View" on a previous version.
4. Click "Restore" on a prior version.

**Expected Result**
- All versions are listed with version numbers, dates, and authors.
- A previous version can be viewed.
- Restoring a version creates a new version that is a copy of the selected prior version; the restored version becomes the latest.

**Pass Criteria** `GET /documents/{id}/versions` returns version list; restore creates a new version entry.

---

### TC-DOC-003
**Title** Generate a document from a template  
**Module** Documents / Templates  
**Priority** P2  

**Preconditions** A matter exists; at least one template is available.  

**Steps**
1. Navigate to the matter's Documents tab.
2. Click "Create from Template".
3. Select a template (e.g., "Non-Disclosure Agreement").
4. Fill in merge fields (e.g., party names, effective date).
5. Click "Generate".

**Expected Result**
- A new document is created in the matter with the template's content and merged fields populated.
- The document is assigned the type from the template.
- Status is "draft".
- The document appears in the matter's document list.

**Pass Criteria** `POST /templates/{id}/instantiate` returns `201`; document content reflects merged fields.

---

### TC-DOC-004
**Title** Submit a document for AI assistance  
**Module** Documents / AI  
**Priority** P2  

**Preconditions** A document exists in "draft" status.  

**Steps**
1. Open a document in the editor.
2. Select a portion of text or the entire document.
3. Click "AI Assist".
4. Choose a workflow (e.g., "summarise_matter" or "draft_email").
5. Enter instructions.
6. Click "Generate".

**Expected Result**
- An AI output record is created and linked to the document.
- The AI response is displayed in a side panel or inline.
- The AI output has a risk level and citation status.
- If the content was edited, the document is marked "ai_assisted".

**Pass Criteria** `POST /ai/generate` returns `200` with AI output; document status reflects ai_assisted if edited.

---

### TC-DOC-005
**Title** Approve an AI-generated output  
**Module** Documents / AI  
**Priority** P2  

**Preconditions** An AI output exists with `reviewStatus: pending`.  

**Steps**
1. Review the AI-generated content.
2. Click "Accept".

**Expected Result**
- The AI output's review status is set to "reviewed".
- The reviewing user is recorded.
- If the decision was "overridden", a note is required.

**Pass Criteria** `POST /ai/outputs/{id}/review` returns `200` with `reviewStatus: reviewed` and `reviewedBy` set.

---

### TC-DOC-006
**Title** Submit a document for partner approval  
**Module** Documents  
**Priority** P1  

**Preconditions** A document exists in "review" status.  
**Role** Attornary (submitting) → Partner (approving).  

**Steps**
1. Open the document.
2. Click "Submit for Approval".
3. (As partner) Navigate to "Pending Approvals".
4. Click on the document.
5. Review and click "Approve".

**Expected Result**
- After submission, the document status changes to "approved" (from the partner's perspective, it was in "ai_assisted" or "review").
- Approval is recorded with timestamp and approver.
- The status update is reflected in the workflow engine.

**Pass Criteria** `POST /documents/{id}/submit` returns `200`; partner approval via workflow updates document status.

---

### TC-DOC-007
**Title** Send a document for client e-signature  
**Module** Documents  
**Priority** P2  

**Preconditions** A document exists in "approved" status. A client contact with an email address exists.  

**Steps**
1. Open the document.
2. Click "Send for Signature".
3. Select the client contact as the signer.
4. Enter a subject and message.
5. Click "Send".

**Expected Result**
- The document status changes to "signed" (pending client signature).
- A signature request is created and sent via email.
- The client receives an email with a link to sign.

**Pass Criteria** `POST /documents/{id}/send-signature` returns `200`; document status = "signed"; email dispatched.

---

### TC-DOC-008
**Title** Client signs a document  
**Module** Documents  
**Priority** P1  

**Preconditions** A document has been sent for signature; the client has the signing link.  

**Steps**
1. The client clicks the link in the email.
2. The client reviews the document.
3. The client clicks "Sign".
4. The client confirms their identity (if required).

**Expected Result**
- The document status changes to "signed" (final).
- A signature certificate is generated and stored.
- The signature is verifiable.
- Both parties are notified.

**Pass Criteria** `POST /documents/{id}/sign` returns `200`; signature certificate is generated; status is final.

---

### TC-DOC-009
**Title** Verify a document signature certificate  
**Module** Documents  
**Priority** P2  

**Preconditions** A document has been signed by a client.  

**Steps**
1. Navigate to the document's detail page.
2. Click "Verify Signature" or "Signature Certificate".

**Expected Result**
- A certificate of signature is displayed showing the signer's name, timestamp, and a verification hash or code.
- The signature status is shown as "Verified" or "Invalid".

**Pass Criteria** `GET /documents/{id}/signature-certificate` returns certificate details; `POST /documents/{id}/verify-citations` validates the signature.

---

### TC-DOC-010
**Title** Update a document's status  
**Module** Documents  
**Priority** P2  

**Preconditions** A document exists.  

**Steps**
1. Open a document.
2. Click "Change Status".
3. Select a new valid status (e.g., "review" from "draft").

**Expected Result**
- The document status is updated.
- The transition is recorded in the timeline.
- The document is not in an "archived" status when active workflow is needed.

**Pass Criteria** `PATCH /documents/{id}/status` returns `200` with new status; invalid transitions return `409`.

---

### TC-DOC-011
**Title** Save AI-generated content to a matter  
**Module** Documents / AI  
**Priority** P2  

**Preconditions** An AI output exists. A matter exists.  

**Steps**
1. Review the AI output.
2. Click "Save to Matter".
3. Optionally edit the content before saving.
4. Confirm save.

**Expected Result**
- The AI output is saved as a document in the matter.
- The document is linked to the AI output record.
- The document status is "ai_assisted".

**Pass Criteria** `POST /ai/outputs/{id}/save-to-matter` returns `200`; document created with `status: ai_assisted`.

---

### TC-DOC-012
**Title** Verify AI output citations  
**Module** Documents / AI  
**Priority** P3  

**Preconditions** An AI output with citations exists.  

**Steps**
1. Open the AI output.
2. Click "Verify Citations".

**Expected Result**
- The system attempts to verify all citations in the AI output.
- The citation status is updated to "verified", "unverified", or "none".
- A confidence score is displayed.

**Pass Criteria** `POST /ai/outputs/{id}/verify-citations` returns `200` with updated `citationStatus`.

---

### TC-DOC-013
**Title** View all documents for a client  
**Module** Documents / Clients  
**Priority** P3  

**Steps**
1. Navigate to a client's detail page.
2. Click the "Documents" tab.

**Expected Result**
- All documents associated with the client (via matters) are listed.
- Each document shows its matter, status, and last updated date.

**Pass Criteria** `GET /clients/{id}/documents` returns document list.

---

## 5. TASKS

### TC-TASK-001
**Title** Create a task on a matter  
**Module** Tasks  
**Priority** P2  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter's "Tasks" tab.
2. Click "New Task".
3. Enter a title and description.
4. Assign to a user.
5. Set a due date and priority (e.g., "High").
6. Click "Save".

**Expected Result**
- The task is created and appears in the matter's task list.
- The assigned user receives a notification.
- The task has status "pending".

**Pass Criteria** `POST /matters/{matterId}/tasks` returns `201` with `status: pending`.

---

### TC-TASK-002
**Title** Transition a task through its lifecycle  
**Module** Tasks  
**Priority** P1  

**Preconditions** A task exists in "pending" status, assigned to the current user.  

**Steps**
1. Open the task.
2. Click "Start Task" → status becomes "in_progress".
3. Complete the work.
4. Click "Mark Complete" → status becomes "completed".

**Expected Result**
- Status transitions: pending → in_progress → completed.
- Time spent in each status is tracked.
- The assigned user's workload is updated.

**Pass Criteria** `PATCH /tasks/{id}` returns updated status; lifecycle is enforced.

---

### TC-TASK-003
**Title** Cancel a task  
**Module** Tasks  
**Priority** P3  

**Preconditions** A task exists in "pending" or "in_progress" status.  

**Steps**
1. Open the task.
2. Click "Cancel Task".
3. Enter a reason for cancellation.
4. Confirm.

**Expected Result**
- The task status changes to "cancelled".
- The cancellation reason is recorded.

**Pass Criteria** `PATCH /tasks/{id}` returns `200` with `status: cancelled`.

---

### TC-TASK-004
**Title** View tasks in the global task queue  
**Module** Tasks  
**Priority** P2  

**Preconditions** Multiple tasks exist assigned to the current user.  

**Steps**
1. Navigate to "My Tasks" or the global task queue.

**Expected Result**
- A list of all tasks assigned to the user is displayed.
- Tasks are grouped by status (pending, in_progress, completed).
- Each task shows title, due date, priority, and associated matter.

**Pass Criteria** `GET /tasks` returns task array with correct assignments.

---

### TC-TASK-005
**Title** Update a task from the global queue  
**Module** Tasks  
**Priority** P3  

**Preconditions** A task exists in the global queue.  

**Steps**
1. Navigate to the global task queue.
2. Click on a task.
3. Change its priority and/or status.
4. Click "Save".

**Expected Result**
- The task is updated with the new values.
- The change is reflected across all views.

**Pass Criteria** `PATCH /tasks/{id}` returns `200` with updated fields.

---

## 6. CONFLICTS

### TC-CONFLICT-001
**Title** Run an AI-powered conflict check  
**Module** Conflicts  
**Priority** P1  

**Preconditions** A matter exists; at least one client is associated.  

**Steps**
1. Navigate to the matter's "Conflicts" tab.
2. Click "Run Conflict Check".
3. Review the parties (client name, aliases, related parties).
4. Click "Start Check".

**Expected Result**
- The system scans all existing clients, matters, and related parties for potential conflicts.
- Results are ranked by severity (low, medium, high).
- Potential conflicts are listed with confidence scores.
- The conflict check record has status "pending" until reviewed.

**Pass Criteria** `POST /conflicts/check` returns `200` with `ConflictCheckResult` containing matches and severity.

---

### TC-CONFLICT-002
**Title** Partner reviews and clears a conflict check  
**Module** Conflicts  
**Priority** P1  

**Preconditions** A conflict check exists with status "pending" or "further_review".  
**Role** Partner.  

**Steps**
1. Navigate to the Conflicts module.
2. Find the pending conflict check.
3. Review the findings.
4. Click "Approve" (clear the conflict).
5. Add a review note.

**Expected Result**
- The conflict check record status changes to "cleared" or "approved".
- The reviewer is recorded with timestamp.
- The associated matter can now transition to "Active" (if previously blocked).

**Pass Criteria** `POST /conflicts/{id}/review` returns `200` with `status: approved`; matter status transition to "active" is now permitted.

---

### TC-CONFLICT-003
**Title** Reject a conflict check  
**Module** Conflicts  
**Priority** P2  

**Preconditions** A conflict check exists with a high-severity finding.  
**Role** Partner.  

**Steps**
1. Navigate to the conflict check.
2. Review the high-severity conflict.
3. Click "Reject".
4. Add a note explaining the rejection.

**Expected Result**
- The conflict check status changes to "rejected".
- The associated matter cannot be activated.
- An alert is raised.

**Pass Criteria** `POST /conflicts/{id}/review` returns `200` with `status: rejected`.

---

### TC-CONFLICT-004
**Title** View conflict check history  
**Module** Conflicts  
**Priority** P3  

**Steps**
1. Navigate to the Conflicts module.
2. Filter by status (e.g., "approved", "rejected", "pending").
3. Filter by severity.

**Expected Result**
- A list of all conflict check records is displayed with status, severity, matter, and review date.
- Filters narrow the results accordingly.

**Pass Criteria** `GET /conflicts` returns filtered arrays.

---

## 7. TIME TRACKING

### TC-TIME-001
**Title** Start and stop a time entry  
**Module** Time Tracking  
**Priority** P1  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter's "Time" tab.
2. Click "Start Timer".
3. Select activity type (e.g., "Drafting", "Research").
4. Enter a description.
5. Perform work for a period.
6. Click "Stop Timer".

**Expected Result**
- A time entry is created with start/end timestamps and calculated duration.
- The entry appears in the matter's time list.
- The entry is billable by default.

**Pass Criteria** `POST /time-entries` returns `201` with start, end, and duration.

---

### TC-TIME-002
**Title** Manually add a time entry  
**Module** Time Tracking  
**Priority** P2  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter's "Time" tab.
2. Click "Add Time Entry".
3. Enter date, hours, activity type, and description.
4. Click "Save".

**Expected Result**
- A time entry is created with the manual duration and details.
- The entry is included in billing calculations.

**Pass Criteria** `POST /time-entries` returns `201`; entry has specified hours.

---

### TC-TIME-003
**Title** Edit a time entry  
**Module** Time Tracking  
**Priority** P2  

**Preconditions** A time entry exists.  

**Steps**
1. Navigate to the time entries list.
2. Click "Edit" on an entry.
3. Change the description and/or hours.
4. Click "Save".

**Expected Result**
- The time entry is updated.
- The edit is recorded in the audit log.

**Pass Criteria** `PATCH /time-entries/{id}` returns `200` with updated fields.

---

### TC-TIME-004
**Title** Delete a time entry  
**Module** Time Tracking  
**Priority** P3  

**Preconditions** An unbilled time entry exists.  

**Steps**
1. Navigate to the time entries list.
2. Click "Delete" on an entry.
3. Confirm deletion.

**Expected Result**
- The time entry is removed.
- If it was included in an invoice, the deletion is rejected.

**Pass Criteria** `DELETE /time-entries/{id}` returns `204`; billed entries return `409 Conflict`.

---

### TC-TIME-005
**Title** Filter and search time entries  
**Module** Time Tracking  
**Priority** P3  

**Preconditions** Multiple time entries exist across matters and users.  

**Steps**
1. Navigate to the global "Time" page.
2. Filter by matter.
3. Filter by date range.
4. Filter by billing status (billed/unbilled).

**Expected Result**
- Results update to show only matching entries.
- Each filter can be applied independently or in combination.

**Pass Criteria** `GET /time-entries?matterId=...&startDate=...&endDate=...&billed=...` returns filtered arrays.

---

## 8. BILLING & INVOICES

### TC-BILL-001
**Title** Generate an invoice from time entries  
**Module** Billing  
**Priority** P1  

**Preconditions** A matter exists with unbilled time entries.  
**Role** Billing attorney or administrator.  

**Steps**
1. Navigate to the matter's "Billing" tab.
2. Click "Generate Invoice".
3. Review the selected time entries and calculations.
4. Click "Generate".

**Expected Result**
- An invoice is created with status "draft".
- The included time entries are marked as billed.
- The invoice total reflects all time entries at their configured rates.
- The invoice appears in the matter's billing section.

**Pass Criteria** `POST /invoices/generate` returns `201` with `status: draft`; time entries are marked billed.

---

### TC-BILL-002
**Title** Submit an invoice for approval  
**Module** Billing  
**Priority** P1  

**Preconditions** An invoice exists in "draft" status.  

**Steps**
1. Open the invoice.
2. Click "Submit for Approval".
3. Enter any required notes.
4. Confirm.

**Expected Result**
- The invoice status changes to "pending_review".
- Assigned partners receive a notification.
- The action is recorded in the audit log.

**Pass Criteria** `POST /invoices/{id}/submit` returns `200` with `status: pending_review`.

---

### TC-BILL-003
**Title** Approve an invoice  
**Module** Billing  
**Priority** P1  

**Preconditions** An invoice exists in "pending_review" status.  
**Role** Partner.  

**Steps**
1. Navigate to "Pending Approvals" or the invoice.
2. Review invoice details.
3. Click "Approve".
4. Add approval note.

**Expected Result**
- The invoice status changes to "approved".
- The approver and timestamp are recorded.

**Pass Criteria** `POST /invoices/{id}/decision` (decision: approve) returns `200` with `status: approved`.

---

### TC-BILL-004
**Title** Send an approved invoice to a client  
**Module** Billing  
**Priority** P1  

**Preconditions** An invoice exists in "approved" status with a client email on file.  

**Steps**
1. Open the invoice.
2. Click "Send".
3. Review the recipient and email content.
4. Click "Send Invoice".

**Expected Result**
- The invoice status changes to "sent".
- The client receives an email with the invoice attached.
- A due date is set (default 30 days).
- The action is recorded in the audit log.

**Pass Criteria** `POST /invoices/{id}/send` returns `200` with `status: sent`; email is queued via provider operations.

---

### TC-BILL-005
**Title** Record payment for an invoice  
**Module** Billing  
**Priority** P1  

**Preconditions** An invoice exists in "sent" status with outstanding balance.  

**Steps**
1. Open the invoice.
2. Click "Record Payment".
3. Enter payment amount, date, and method (e.g., "Credit Card", "EFT").
4. Click "Record".

**Expected Result**
- The invoice status changes to "paid".
- The payment is recorded with method and timestamp.
- Outstanding balance is zeroed.

**Pass Criteria** `POST /invoices/{id}/mark-paid` returns `200` with `status: paid`.

---

### TC-BILL-006
**Title** View billing summary on dashboard  
**Module** Billing / Dashboard  
**Priority** P2  

**Steps**
1. Navigate to the Dashboard.
2. View the "Billing Summary" widget.

**Expected Result**
- The summary shows: total invoiced (this period), total paid, total outstanding, overdue invoices count, and aging breakdown.

**Pass Criteria** `GET /dashboard/billing-summary` returns `BillingSummary` with correct values.

---

### TC-BILL-007
**Title** View invoices for a specific client  
**Module** Billing / Clients  
**Priority** P3  

**Steps**
1. Navigate to a client's detail page.
2. Click the "Billing" tab.

**Expected Result**
- All invoices for the client are listed with status, total, and due date.

**Pass Criteria** `GET /clients/{id}/billing` returns invoice list.

---

## 9. KNOWLEDGE BASE

### TC-KB-001
**Title** Create a knowledge base item  
**Module** Knowledge Base  
**Priority** P2  

**Preconditions** User is authenticated.  

**Steps**
1. Navigate to the Knowledge Base module.
2. Click "New Knowledge Item".
3. Enter a title, content, type, and category.
4. Add tags and jurisdiction.
5. Click "Save".

**Expected Result**
- The item is created with status "pending" (awaiting approval).
- The item appears in the list under the correct category.

**Pass Criteria** `POST /knowledge` returns `201` with `status: pending`.

---

### TC-KB-002
**Title** Submit a knowledge item for approval  
**Module** Knowledge Base  
**Priority** P2  

**Preconditions** A knowledge item exists in draft/pending status.  

**Steps**
1. Open the knowledge item.
2. Click "Submit for Review".

**Expected Result**
- The item status changes to "pending" (awaiting reviewer).
- Reviewers receive a notification.
- The item appears in the approval queue.

**Pass Criteria** `POST /knowledge/{id}/submit-for-review` returns `200` with `status: pending`.

---

### TC-KB-003
**Title** Approve or reject a knowledge item  
**Module** Knowledge Base  
**Priority** P2  

**Preconditions** A knowledge item is submitted for approval.  
**Role** Reviewer or approver.  

**Steps**
1. Navigate to the approval queue.
2. Open the knowledge item.
3. Review the content.
4. Click "Approve" or "Reject".
5. Add a note (required for rejection).

**Expected Result**
- If approved: item status changes to "approved".
- If rejected: item status returns to "draft" (or "rejected").
- The decision is recorded with reviewer and timestamp.

**Pass Criteria** `POST /knowledge/{id}/decision` returns `200` with correct status; note is required for rejection.

---

### TC-KB-004
**Title** View and manage knowledge item versions  
**Module** Knowledge Base  
**Priority** P3  

**Preconditions** A knowledge item has been edited and re-saved.  

**Steps**
1. Open the knowledge item.
2. Click the "Versions" tab.
3. Compare two versions side by side.
4. Restore a previous version (if needed).

**Expected Result**
- All versions are listed with author and date.
- Version comparison shows diffs.
- Restoring creates a new version.

**Pass Criteria** `GET /knowledge/{id}/versions` returns version list.

---

### TC-KB-005
**Title** Search the knowledge base  
**Module** Knowledge Base  
**Priority** P2  

**Preconditions** Multiple knowledge items exist across categories and jurisdictions.  

**Steps**
1. Enter a search term (e.g., "non-disclosure").
2. Apply category and jurisdiction filters.
3. Clear filters.

**Expected Result**
- Search results reflect the query and filters.
- Results show title, category, and last updated date.

**Pass Criteria** `GET /knowledge?q=...&category=...&jurisdiction=...` returns filtered arrays.

---

## 10. TEMPLATES

### TC-TEMPLATE-001
**Title** List available governed templates  
**Module** Templates  
**Priority** P2  

**Steps**
1. Navigate to the Templates module.
2. Browse the template list.

**Expected Result**
- Templates are listed with name, type, practice area, and jurisdiction.
- Only approved templates are shown.
- Each template has a version and approval status.

**Pass Criteria** `GET /templates` returns template array; unapproved templates are excluded.

---

### TC-TEMPLATE-002
**Title** Instantiate a template into a matter  
**Module** Templates  
**Priority** P1  

**Preconditions** A matter exists; at least one template is approved.  

**Steps**
1. Navigate to the matter's Documents tab.
2. Click "Create from Template".
3. Select a template.
4. Fill in merge fields.
5. Click "Generate".

**Expected Result**
- A new document is created in the matter.
- The document content is populated from the template with merge fields filled.
- The document is linked to the template version.

**Pass Criteria** `POST /templates/{id}/instantiate` returns `201`; document content reflects merged values.

---

## 11. AI ASSISTANT

### TC-AI-001
**Title** Generate AI output using the draft_contract workflow  
**Module** AI Assistant  
**Priority** P1  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter's AI Assistant tab.
2. Select workflow "Draft Contract".
3. Enter instructions (e.g., "Draft an NDA for a software licensing deal").
4. Provide parameters (contractType, jurisdiction, clauses).
5. Click "Generate".

**Expected Result**
- The AI generates contract text.
- An `AiOutput` record is created with risk level, citation status, and confidence score.
- The workflow label is displayed.
- `requiresReview` is set based on risk level.

**Pass Criteria** `POST /ai/generate` returns `200` with `AiOutput` containing `workflow: draft_contract`.

---

### TC-AI-002
**Title** Generate AI output using the summarise_matter workflow  
**Module** AI Assistant  
**Priority** P2  

**Preconditions** A matter with documents exists.  

**Steps**
1. Navigate to the matter.
2. In the AI Assistant, select workflow "Summarise Matter".
3. Enter specific instructions.
4. Click "Generate".

**Expected Result**
- The AI produces a summary of the matter based on documents and activities.
- The `AiOutput` record is created and linked to the matter.

**Pass Criteria** AI output is returned; `workflow: summarise_matter`; output is tied to `matterId`.

---

### TC-AI-003
**Title** Transcribe an audio file  
**Module** AI Assistant  
**Priority** P3  

**Preconditions** User has an audio file.  

**Steps**
1. Navigate to the AI Assistant.
2. Click "Transcribe Audio".
3. Upload an audio file.
4. Click "Transcribe".

**Expected Result**
- The system transcribes the audio.
- The raw audio is never persisted or returned; only the transcribed text is returned.
- The transcription appears in the conversation panel.

**Pass Criteria** `POST /ai/transcribe` returns `AiTranscriptionResponse` with `text`; audio is not stored.

---

### TC-AI-004
**Title** Review an AI output and mark as overridden  
**Module** AI Assistant  
**Priority** P2  

**Preconditions** An AI output exists with `reviewStatus: pending`.  

**Steps**
1. Open the AI output.
2. Review the generated content.
3. Make edits.
4. Select "Overridden" and enter a review note.
5. Submit.

**Expected Result**
- The AI output's `reviewStatus` is set to "overridden".
- `humanOverride` is set to `true`.
- The `reviewNote` is saved.
- `reviewedBy` and `reviewedAt` are recorded.

**Pass Criteria** `POST /ai/outputs/{id}/review` returns `200` with `reviewStatus: overridden` and `humanOverride: true`.

---

### TC-AI-005
**Title** View AI conversation history for a matter  
**Module** AI Assistant  
**Priority** P3  

**Preconditions** AI outputs exist for a matter.  

**Steps**
1. Navigate to the matter's AI Assistant tab.
2. View the conversation history.

**Expected Result**
- All prior AI conversations and outputs for the matter are listed.
- Each entry shows the workflow, query, response preview, and timestamp.

**Pass Criteria** `GET /ai/conversations?matterId={id}` returns conversation list.

---

## 12. LEGAL RESEARCH

### TC-RESEARCH-001
**Title** Perform a legal research query  
**Module** Legal Research  
**Priority** P2  

**Preconditions** A matter exists.  

**Steps**
1. Navigate to the matter's "Research" tab.
2. Enter a research query (e.g., "breach of fiduciary duty remedies in corporate law").
3. Select sources (case law, legislation, firm precedents, knowledge base).
4. Click "Search".

**Expected Result**
- A `ResearchRecord` is created.
- Internal results from firm precedents and knowledge base are returned.
- AI-powered external research status is shown (ok, unavailable, or failed).
- Citations and case references are listed.

**Pass Criteria** `POST /research` returns `200` with `ResearchRecord` containing `internalResults`.

---

### TC-RESEARCH-002
**Title** Save research results to a matter  
**Module** Legal Research  
**Priority** P2  

**Preconditions** A research record exists with results.  

**Steps**
1. Review research results.
2. Click "Save to Matter".

**Expected Result**
- The research record is marked as `savedToMatter: true`.
- The `savedAt` and `savedBy` fields are populated.
- A document may be created from the research (if content was saved).

**Pass Criteria** `PATCH /research/{id}/save` returns `200` with `savedToMatter: true`.

---

### TC-RESEARCH-003
**Title** View available research sources  
**Module** Legal Research  
**Priority** P3  

**Steps**
1. Navigate to the Research module.
2. View the list of available sources.

**Expected Result**
- Sources are listed: firm_precedents (internal), knowledge_base (internal), case_law (external), legislation (external).
- Each source shows whether it is live/available.

**Pass Criteria** `GET /research/sources` returns `ResearchSource` array.

---

## 13. EMAIL

### TC-EMAIL-001
**Title** View matter-centric email correspondence  
**Module** Email  
**Priority** P2  

**Preconditions** A matter exists with linked emails.  

**Steps**
1. Navigate to the matter's "Emails" tab.

**Expected Result**
- All emails linked to the matter are displayed in chronological order.
- Each email shows sender, recipients, subject, and date.
- Read/unread status is indicated.

**Pass Criteria** `GET /matters/{matterId}/emails` returns email array.

---

### TC-EMAIL-002
**Title** Search unlinked emails  
**Module** Email  
**Priority** P2  

**Preconditions** Emails have been ingested that are not linked to any matter.  

**Steps**
1. Navigate to the "Unlinked Emails" view.
2. Search by sender or subject.
3. Select an email.
4. Click "Link to Matter".
5. Select the matter.

**Expected Result**
- The email is linked to the selected matter.
- The email no longer appears in the unlinked list.

**Pass Criteria** `GET /emails/unlinked` returns results; linking succeeds.

---

### TC-EMAIL-003
**Title** Mark an email as read  
**Module** Email  
**Priority** P3  

**Preconditions** An unread email exists.  

**Steps**
1. Open the email.
2. Click "Mark as Read".

**Expected Result**
- The email status is updated to "read".

**Pass Criteria** `POST /matters/{matterId}/emails/{id}/read` returns `200` with updated read status.

---

### TC-EMAIL-004
**Title** Promote an email to a document  
**Module** Email  
**Priority** P3  

**Preconditions** A matter email exists with an attachment.  

**Steps**
1. Open the email.
2. Click "Promote to Document".
3. Edit the document name and type if needed.
4. Confirm.

**Expected Result**
- A document is created from the email content/attachment.
- The document is linked to the matter.
- The email is marked as promoted.

**Pass Criteria** `POST /matters/{matterId}/emails/{id}/promote` returns `201` with document.

---

## 14. AUDIT

### TC-AUDIT-001
**Title** View audit log entries  
**Module** Audit  
**Priority** P2  

**Steps**
1. Navigate to the Admin → Audit Log page.
2. Review the list of recent actions.

**Expected Result**
- All auditable actions are listed (client creation, matter status changes, document uploads, etc.).
- Each entry shows user, action, entity type, entity ID, and timestamp.

**Pass Criteria** `GET /audit-logs` returns audit entries with required fields.

---

### TC-AUDIT-002
**Title** Filter audit log by entity type and action  
**Module** Audit  
**Priority** P3  

**Steps**
1. Navigate to the Audit Log page.
2. Filter by entity type (e.g., "matter").
3. Filter by action (e.g., "status_change").
4. Apply a date range.

**Expected Result**
- Results narrow to matching entries only.
- Each filter is independent and combinable.

**Pass Criteria** `GET /audit-logs?entityType=matter&action=status_change&...` returns filtered array.

---

### TC-AUDIT-003
**Title** Export audit log to CSV  
**Module** Audit  
**Priority** P3  

**Steps**
1. Navigate to the Audit Log page.
2. Apply any desired filters.
3. Click "Export to CSV".

**Expected Result**
- A CSV file is downloaded containing the filtered audit log entries.
- The CSV includes columns: id, action, entityType, entityId, entityTitle, userId, createdAt, and details.

**Pass Criteria** `GET /audit-logs/export` returns CSV file.

---

## 15. DASHBOARD

### TC-DASH-001
**Title** View matter statistics on dashboard  
**Module** Dashboard  
**Priority** P2  

**Steps**
1. Navigate to the Dashboard.
2. View the "Matter Stats" widget.

**Expected Result**
- Counts are displayed for: total matters by status (lead, active, completed, closed), upcoming closings, matters at risk.
- Statistics update in real-time or on refresh.

**Pass Criteria** `GET /dashboard/matter-stats` returns counts.

---

### TC-DASH-002
**Title** View recent activity feed  
**Module** Dashboard  
**Priority** P2  

**Steps**
1. Navigate to the Dashboard.
2. View the "Recent Activity" widget.

**Expected Result**
- A chronological list of recent activities is displayed (new clients, matter status changes, document uploads, invoice generation).
- Each entry shows timestamp, user, action, and entity.

**Pass Criteria** `GET /dashboard/recent-activity` returns activity items.

---

### TC-DASH-003
**Title** View team workload  
**Module** Dashboard / Productivity  
**Priority** P2  

**Steps**
1. Navigate to Dashboard → Team Workload.

**Expected Result**
- A breakdown of workload per team member is displayed.
- Shows open tasks, active matters, and time utilization.

**Pass Criteria** `GET /dashboard/workload` returns `WorkloadItem` array.

---

### TC-DASH-004
**Title** View personal work summary  
**Module** Dashboard  
**Priority** P2  

**Steps**
1. Navigate to the Dashboard.
2. View the "My Work" widget.

**Expected Result**
- Shows the current user's assigned matters, open tasks, and pending approvals.
- Each item is clickable to navigate to the relevant detail page.

**Pass Criteria** `GET /dashboard/personal-work` returns personal work items.

---

## 16. ADMIN

### TC-ADMIN-001
**Title** List all staff users (admin)  
**Module** Admin  
**Priority** P2  
**Role** Administrator.  

**Steps**
1. Navigate to Admin → Users.

**Expected Result**
- A list of all staff users is displayed with name, email, role, and status.
- Users can be filtered by role or status.

**Pass Criteria** `GET /admin/users` returns user array; admin role required.

---

### TC-ADMIN-002
**Title** Create a new staff user (admin)  
**Module** Admin  
**Priority** P2  
**Role** Administrator.  

**Steps**
1. Navigate to Admin → Users.
2. Click "New User".
3. Fill in name, email, and assign a role (e.g., "Attorney", "Paralegal", "Partner").
4. Click "Create".

**Expected Result**
- A new user is created with a temporary password (or invitation email sent).
- The user appears in the user list with the assigned role.

**Pass Criteria** `POST /admin/users` returns `201` with user object.

---

### TC-ADMIN-003
**Title** Update a user's role (admin)  
**Module** Admin  
**Priority** P2  
**Role** Administrator.  

**Steps**
1. Navigate to Admin → Users.
2. Click on a user.
3. Change the role (e.g., "Paralegal" → "Attorney").
4. Click "Save".

**Expected Result**
- The user's role is updated.
- Permissions take effect immediately.
- The change is recorded in the audit log.

**Pass Criteria** `PATCH /admin/users/{id}` returns `200` with updated role.

---

### TC-ADMIN-004
**Title** View connector status (admin)  
**Module** Admin  
**Priority** P2  
**Role** Administrator.  

**Steps**
1. Navigate to Admin → Connectors.

**Expected Result**
- The status of external connectors (email provider, Microsoft 365, etc.) is displayed.
- Connection status, last sync time, and any errors are shown.
- "Connect" button is available for disconnected services.

**Pass Criteria** `GET /admin/connectors` returns connector statuses; connect flow works.

---

### TC-ADMIN-005
**Title** View provider operation queue (admin)  
**Module** Admin  
**Priority** P3  
**Role** Administrator.  

**Steps**
1. Navigate to Admin → Connector Operations.

**Expected Result**
- A list of pending and recent provider operations is displayed (email sends, sync tasks, etc.).
- Each operation shows status (pending, success, failed), type, and timestamp.
- Failed operations can be retried.

**Pass Criteria** `GET /provider-operations` returns operation list; retry succeeds for failed operations.

---

## 17. STORAGE

### TC-STORAGE-001
**Title** Upload a file via signed URL  
**Module** Storage  
**Priority** P1  

**Steps**
1. Click "Upload File".
2. Select a file.
3. The system requests a signed upload URL from the storage service.
4. The file is uploaded directly to the storage provider via the signed URL.

**Expected Result**
- The file is uploaded successfully to secure storage.
- A checksum is computed and verified.
- The file is accessible via the application.

**Pass Criteria** `POST /storage/upload-request` returns signed URL; direct upload succeeds; checksum matches.

---

## 18. WORKFLOW ENGINE

### TC-WORKFLOW-001
**Title** View pending workflow actions  
**Module** Workflow Engine  
**Priority** P2  

**Steps**
1. Navigate to "My Approvals" or "Pending Actions".

**Expected Result**
- All workflow instances where the current user is the next assignee are displayed.
- Each shows the workflow type, related entity, and due date.
- The user can click to take action (approve, reject, etc.).

**Pass Criteria** Workflow engine query returns pending actions for the user.

---

## Cross-Reference: API Path Mapping

| Module | Key Paths |
|--------|-----------|
| Authentication | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/profile`, `PATCH /auth/profile`, `POST /auth/password` |
| Clients | `GET /clients`, `POST /clients`, `GET /clients/{id}`, `PATCH /clients/{id}`, `DELETE /clients/{id}`, `GET /clients/{id}/fica`, `GET /clients/{id}/risk-score`, `GET /clients/{id}/related-parties`, `POST /clients/{id}/related-parties`, `GET /clients/{id}/billing`, `GET /clients/{id}/documents`, `GET /clients/{id}/activity` |
| FICA | `GET /fica/requirements`, `POST /clients/{id}/fica/documents`, `GET /clients/{id}/fica/documents/{docId}`, `GET /clients/{id}/fica/timeline`, `POST /fica/recompute`, `POST /fica/manual-override`, `GET /fica/dashboard`, `GET /fica/expiring` |
| Matters | `GET /matters`, `POST /matters`, `GET /matters/{id}`, `PATCH /matters/{id}`, `GET /matters/{id}/assignees`, `PATCH /matters/{id}/assignees`, `POST /matters/{id}/export`, `PATCH /matters/{id}/status`, `GET /matters/{id}/summary`, `GET /matters/{id}/timeline` |
| Documents | `GET /documents`, `GET /matters/{matterId}/documents`, `POST /matters/{matterId}/documents`, `GET /documents/{id}`, `GET /documents/{id}/versions`, `PATCH /documents/{id}`, `PATCH /documents/{id}/status`, `POST /documents/{id}/ai-assist`, `POST /ai/outputs/{id}/verify-citations`, `POST /documents/{id}/submit`, `POST /documents/{id}/decision`, `POST /documents/{id}/approve` (deprecated), `POST /documents/{id}/send-signature`, `POST /documents/{id}/sign`, `GET /documents/{id}/signature-certificate`, `PATCH /documents/{id}/archive` |
| Tasks | `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}`, `GET /matters/{matterId}/tasks`, `POST /matters/{matterId}/tasks`, `PATCH /matters/{matterId}/tasks/{id}`, `DELETE /matters/{matterId}/tasks/{id}` |
| Conflicts | `POST /conflicts/check`, `POST /conflicts/{id}/review`, `GET /conflicts` |
| Time Tracking | `GET /time-entries`, `POST /time-entries`, `PATCH /time-entries/{id}`, `DELETE /time-entries/{id}` |
| Billing | `GET /invoices`, `POST /invoices`, `GET /invoices/{id}`, `PATCH /invoices/{id}`, `POST /invoices/generate`, `POST /invoices/{id}/submit`, `POST /invoices/{id}/decision`, `POST /invoices/{id}/send`, `POST /invoices/{id}/mark-paid` |
| Knowledge Base | `GET /knowledge`, `POST /knowledge`, `GET /knowledge/{id}`, `PATCH /knowledge/{id}`, `POST /knowledge/{id}/submit-for-review`, `POST /knowledge/{id}/decision`, `PATCH /knowledge/{id}/archive`, `GET /knowledge/{id}/versions` |
| Templates | `GET /templates`, `POST /templates/{id}/instantiate` |
| AI Assistant | `POST /ai/generate`, `POST /ai/transcribe`, `GET /ai/conversations`, `GET /ai/outputs/{id}`, `POST /ai/outputs/{id}/review`, `POST /ai/outputs/{id}/verify-citations`, `POST /ai/outputs/{id}/save-to-matter` |
| Legal Research | `POST /research`, `PATCH /research/{id}/save`, `GET /research/sources` |
| Email | `GET /emails/readiness`, `POST /emails/ingest`, `GET /emails/search`, `GET /emails/unlinked`, `POST /emails/{id}/link`, `GET /matters/{matterId}/emails`, `GET /matters/{matterId}/emails/{id}`, `POST /matters/{matterId}/emails/{id}/read`, `POST /matters/{matterId}/emails/{id}/promote`, `GET /emails/{id}/attachments/{attachmentId}/download` |
| Audit | `GET /audit-logs`, `GET /audit-logs/export` |
| Dashboard | `GET /dashboard/matter-stats`, `GET /dashboard/recent-activity`, `GET /dashboard/matter-pipeline`, `GET /dashboard/fica-overview`, `GET /dashboard/billing-summary`, `GET /dashboard/workload`, `GET /dashboard/personal-work` |
| Admin | `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/{id}`, `GET /admin/connectors`, `POST /admin/connectors/connect` |
| Storage | `POST /storage/upload-request`, `GET /storage/public-objects`, `GET /storage/objects/{id}` |
| Provider Operations | `GET /provider-operations`, `GET /provider-operations/{id}/email-queue`, `POST /provider-operations/callback`, `POST /provider-operations/{id}/retry` |
| Notifications | `GET /notifications`, `POST /notifications/{id}/read` |
| Health | `GET /healthz` |

---

*Total test cases: 60*