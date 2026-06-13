# Vantage User Schema & UI Design Guardrails

## 1. Core Flat User Profile Schema
The application enforces a strict single source of truth for user data. All profile parameters, metadata, and settings must exist completely flat within `users/{userId}`. Sub-collections for core profile data are strictly forbidden. All user metadata, configuration, preferences, and personal markers sits entirely as flat, direct properties in the root user document map located exactly at `users/{userId}`. No nested sub-collection documents underneath are used for profile fragments.

```json
{
  "uid": "Auth_UID_String",
  "fullName": "John Doe",
  "displayName": "John",
  "email": "john@vantage.ae",
  "dob": "1990-01-01T00:00:00Z",
  "maritalStatus": "Married",
  "dependents": [
    { "relationship": "Son", "age": 6 },
    { "relationship": "Mother", "age": 62 }
  ],
  "baseCurrency": "AED",
  "enabledCurrencies": ["AED", "USD"],
  "financialExperience": 3,
  "financialGoals": "Buy a family villa, optimize long-term savings",
  "createdAt": "2026-06-05T09:43:00Z",
  "updatedAt": "2026-06-05T09:43:00Z",
  "geminiInsightsEnabled": true,
  "hasAcceptedTerms": true,
  "onboardedAt": "2026-06-05T09:50:00Z",
  "lastLogin": "2026-06-05T09:43:00Z",
  "subscriptionTier": "Premium"
}
```

### Type Definitions
- **dependents**: Array of objects containing exactly `{ relationship: string, age: number }`. Relationship choices are strictly `["Father", "Mother", "Son", "Daughter", "Friend", "Others"]`.
- **subscriptionTier**: Stripped to title case or regular casing, defaults to `"Premium"`.
- **baseCurrency**: Base display currency (e.g. `"AED"`).
- **enabledCurrencies**: String enum list of enabled currencies.

---

## 2. UI Casing & Visual Token Guardrails
- **No Forced Uppercase**: No uppercase classes or uppercase styling parameters (`uppercase`, `tracking-widest`, etc.) are permitted across the application interface for text widgets, buttons, forms, lists, or headers. Use standard sentence-case or title-case text labels.
- **Font Family**: All widgets, labels, inputs, and controls strictly inherit and default to the **'Google Sans'** font family properties.
- **Font Weighting Prose**: Use standard regular font weights (`font-normal` or `font-weight: 400`) for all descriptive labels, prose, placeholder prompts, list text, and general text.
- **Font Weighting Numbers/Triggers**: Use bold font weights (`font-bold` or `font-weight: 700`) exclusively for primary action handlers/triggers or core monetary/balance counters.
- **Workspace Canvas Background**: All interactive sections must sit clean and flat on the white workspace canvas (#FFFFFF) outline with minimalist hair-line border spacing.

---

## 3. Bank Account Schema Blueprint (Checking & Savings)
For all accounts representing bank liquidity models (Checking and Savings):
- **Document Collection Path**: `users/{userId}/accounts/{accountId}`
- **Document ID (`accountId`)**: Auto-generated unique random UUID string (NOT the user's Auth UID).
- **Exact Document Payload**: Ensure the document fields exactly map to this flat schema structure:
```json
{
  "accountId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "type": "Bank",
  "bankAccountType": "Checking",
  "name": "ADCB Checking",
  "currency": "AED",
  "startingBalance": 10000.00,
  "currentBalance": 11500.00,
  "minBalanceFloor": 3000.00,
  "defaultTransferFee": 0.00,
  "atmAutoSync": false,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

- **Live Balance Sourcing**: Reroute all dashboard balances, multi-currency grids, and net worth display aggregates to source live numbers strictly from the 'currentBalance' property field, keeping the historical 'startingBalance' field static as an immutable ledger opening point.
- **Casing & Visual Token Guardrails**: Reinforce layout preferences across this sub-module—ensure absolutely NO forced uppercase string overrides or CSS text transformations (`uppercase`, `tracking-widest`, etc.) are deployed. Entry fields, labels, placeholders, and account selection indicators must strictly use the 'Google Sans' font family configuration, rendering regular text notes in `font-weight: 400` and currency figures or section titles in `font-weight: 700` over flat, pure white component canvases (#FFFFFF).

---

## 4. Cash Account Schema Blueprint (Physical Cash & Wallets)
For all accounts representing cash liquidity models (Physical cash, safe wallets, unlinked cash ledgers):
- **Document Collection Path**: `users/{userId}/accounts/{accountId}`
- **Document ID (`accountId`)**: Auto-generated unique random UUID string (NOT the user's Auth UID).
- **Exact Document Payload**: Ensure the document fields exactly map to this flat schema structure:
```json
{
  "accountId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "type": "Cash",
  "bankAccountType": "Cash",
  "name": "Physical Wallet",
  "currency": "AED",
  "startingBalance": 500.00,
  "currentBalance": 450.00,
  "minBalanceFloor": 0.00,
  "defaultTransferFee": 0.00,
  "atmAutoSync": false,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

- **Live Balance Sourcing**: Reroute all cash tracking widgets, portfolio allocation charts, and network total aggregates to source numbers strictly from the 'currentBalance' property field, keeping the 'startingBalance' field static as an opening baseline.
- **Casing & Visual Token Guardrails**: Reinforce our permanent layout preference rules across this sub-module—ensure absolutely NO forced uppercase string overrides or CSS text transformations are deployed. The entry fields, labels, placeholders, and account indicators must strictly use the 'Google Sans' font family configuration, rendering regular text notes in `font-weight: 400` and currency figures or section titles in `font-weight: 700` over flat, pure white component canvases (#FFFFFF).

---

## 5. Liability Account Schema Blueprints (Credit Card, Personal Loan, Mortgage)
For all accounts representing financial liability models:
- **Document Collection Path**: `users/{userId}/accounts/{accountId}`
- **Document ID (`accountId`)**: Auto-generated unique random UUID string (NOT the user's Auth UID).
- **Exact Document Payload**: Ensure the document fields exactly map to these flat schema structures:

### Credit Card
```json
{
  "accountId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "type": "Credit Card",
  "name": "Emirates NBD Titanium",
  "currency": "AED",
  "startingBalance": 0.00,
  "currentBalance": -2500.00,
  "creditLimit": 20000.00,
  "interestRate": 14.99,
  "paymentDueDate": "YYYY-MM-DD",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### Personal Loan & Mortgage
```json
{
  "accountId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "type": "Personal Loan", // or "Mortgage"
  "name": "HSBC Home Loan",
  "currency": "AED",
  "startingBalance": -500000.00,
  "currentBalance": -485000.00,
  "interestRate": 4.99,
  "recurringProtocol": "AED 5,000 Monthly",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

- **Conditional Parameters & Metrics Sourcing**: 
  - `creditLimit` and `paymentDueDate` must only be populated or rendered if `type` equals `"Credit Card"`.
  - `interestRate` must be saved natively as a double/float decimal number supporting fractional percentages (e.g., `14.99`).
  - Liabilities must subtract from the Net Worth calculations using their dynamic 'currentBalance' value.
- **Casing & Visual Token Guardrails**: Entry fields, labels, placeholders, interest fields, and date picking components must strictly use the **'Google Sans'** font family configuration, rendering standard prose, list text, and notes in standard regular weights (`font-weight: 400`), while section titles, primary actions, and currency digits/sums are emphasized in bold weights (`font-weight: 700`) over flat, pure white component canvases (#FFFFFF).

---

## 6. Debt Management Routing & Automated Spawning Logic
- **Direct Entry Prohibition**: Loans and Mortgages cannot be added directly from the accounts workflow; they must be initialized via the Debt Management module under the Essentials tab, which automatically generates the matching account reference record.
- **Automated Spawning**: When a user configures or saves a Loan or Mortgage inside the Debt Management module, the application must automatically trigger a background write/transaction that creates or matches a corresponding liability document inside the `users/{userId}/accounts` collection path using standard casing and title rules.

---

## 7. Investment Portfolio Account Schema Blueprint
For all accounts representing investment models (Brokers, Platforms, or Asset aggregates):
- **Document Collection Path**: `users/{userId}/accounts/{accountId}`
- **Document ID (`accountId`)**: Auto-generated unique random UUID string (NOT the user's Auth UID).
- **Exact Document Payload**:
```json
{
  "accountId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "type": "Investment",
  "name": "Sarwa Portfolio",
  "currency": "AED",
  "startingBalance": 5000.00,
  "currentBalance": 4500.00,
  "platformFees": 10.00,
  "totalGainLoss": -500.00,
  "includeInLiquidity": false,
  "subAssets": [
    {
      "assetId": "Asset_UUID_1",
      "assetName": "Emaar Properties",
      "principalInvested": 3000.00,
      "investmentValue": 2500.00,
      "estimatedYield": 4.5,
      "yieldPeriod": "Yearly",
      "passiveIncome": 112.50
    },
    {
      "assetId": "Asset_UUID_2",
      "assetName": "Tesla Inc",
      "principalInvested": 2000.00,
      "investmentValue": 2000.00,
      "estimatedYield": 0.0,
      "yieldPeriod": "Yearly",
      "passiveIncome": 0.00
    }
  ],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

- **Dynamic Balances & Metrics Sourcing**: 
  - The dynamic `currentBalance` value must reflect the active total value of all underlying investments (sum of `investmentValue` across all elements of the `subAssets` array) and feed directly into the main net worth calculation widget.
  - Sub-assets arrays contain flat, direct properties using native dual-names (`assetId` and `id`, `assetName` and `name`, `investmentValue` and `currentValue`) to ensure perfect visual pairing and backwards compatibility.
- **Casing & Visual Token Guardrails**: Reinforce layout preferences across this sub-module—ensure absolutely NO forced uppercase string overrides or CSS text transformations are deployed. Entry fields, labels, placeholders, and account selection indicators must strictly use the **'Google Sans'** font family configuration, rendering regular text notes in standard weight (`font-weight: 400`) and currency figures or section titles in bold weight (`font-weight: 700`) over flat, pure white component canvases (#FFFFFF).

---

## 8. Mini Budgets Schema & Background Accumulation Logic
For all accounts and envelope structures representing Mini Budgets:
- **Document Collection Path**: `users/{userId}/miniBudgets/{budgetId}`
- **Document ID (`budgetId`)**: Auto-generated unique random UUID string (NOT the user's Auth UID).
- **Exact Document Payload**:
```json
{
  "budgetId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "categoryTitle": "Groceries",
  "allocatedAmount": 3000.00,
  "spentAmount": 450.00,
  "currency": "AED",
  "iconAsset": "shopping-cart",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

- **Background Accumulation Rules**:
  - The `spentAmount` property field must mutate dynamically. Whenever a transaction matching this budget's `categoryTitle`/`category` and `userId` is confirmed and committed to the database, a reactive listener recalculates the sum of confirmed expenses for the current cycle and automatically updates the `spentAmount` field in Firestore.
  - **Confirming an item via notification floating nodes triggers a split backend process—writing the ledger transaction document first, followed by an immediate atomic database increment on the targeted miniBudgets spentAmount field.**
- **Client-Side Reactive Aggregates**: Top-level budget dashboard aggregates must never be saved as fixed properties in a parent document; they must be evaluated dynamically using reactive client-side array expressions over the active collection state.
- **Casing & Typography Token Compliance**: Absolutely NO forced uppercase overrides or CSS text transformations (`uppercase`, `tracking-widest`, etc.) are deployed for envelopes, budgets, category titles, progress percentages, spent readouts, or card headers. The text widgets, progress indicators, limits, and values strictly inherit and default to the **'Google Sans'** font family properties, rendering description metrics in `font-weight: 400` and currency sums/totals in `font-weight: 700` over flat, pure white canvas components (`#FFFFFF`) with minimalist hairline borders.

---

---

## 9. Base Monthly Income / Salary Sourcing Logic
- **Operational Data Dependency Rules**:
  - The primary user dashboard base salary calculation must always be dynamically evaluated from an active transaction matching Category: Income and Sub-Category: Wage. No hardcoded or static fallback values are allowed.
  - To locate this value, the application executes a live query on the user's transaction data space looking specifically for entries that satisfy:
    - `category` equals `"Income"`
    - `subCategory` equals `"Wage"` (or lowercase `subcategory` equals `"Wage"`)
    - `isRecurring` equals `true`
  - **Live Dynamic Fallback**: If no records matching this strict template exist in the collection (or if the user deletes their transactions), the dashboard display readout value must reactively drop down to exactly `0.00 AED`.
  - **Casing & Visual Compliance**: Any loading states, text summary labels, currency counters, or fallback panels updated by this logic must use natural Title Case or Sentence Case rules with zero forced uppercase letters. All characters must render in the clean 'Google Sans' font family, deploying standard regular weights (400) for text notes ('Estimated monthly earnings') and bold faces (700) for dynamic financial amounts over pure white component panels (#FFFFFF) with minimalist hairline borders.

---

## 10. Recurring Transactions Schema & Relational Validation Rules
For all schedules representing the Recurring Transactions engine:
- **Document Collection Path**: `users/{userId}/recurringTransactions/{recurringId}`
- **Document ID (`recurringId`)**: Auto-generated unique random UUID string (NOT the user's Auth UID).
- **Exact Document Payload**:
```json
{
  "recurringId": "Auto_Generated_UUID_String",
  "userId": "Auth_UID_String",
  "title": "Monthly Salary Payout",
  "amount": 15500.00,
  "transactionType": "income", 
  "frequency": "Monthly",
  "sourceAccountId": "ADCB_Checking_ID",
  "destinationAccountId": "Car_Loan_Account_ID",
  "startDate": "timestamp",
  "nextExecutionDate": "timestamp",
  "dayOption": 25,
  "isActive": true,
  "isBreakdownConfigured": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

- **Operational Flow Rules**:
  - **Account Routing**: The `destinationAccountId` property is only populated or validated if the `transactionType` is explicitly set to `"transfer"`. Otherwise, it must remain `null`.
  - **Inter-Module Integration**: When configuring multi-sub-type packages within the Salary Breakdown card, it automatically flags `isBreakdownConfigured` to `true` and synchronizes the total value directly to this document's `amount` field to serve as the application's ultimate source of truth for dashboard income queries.
- **Casing & Typography Token Compliance**: Reinforce layout preferences across this module—ensure absolutely NO forced uppercase overrides or CSS text transformations (`uppercase`, `tracking-widest`, etc.) are deployed for schedules, row labels, execution date note strings, frequency selections, or title text inputs. Row labels, execution date note strings, frequency selections, and title text inputs must use clean Title Case or Sentence Case rules. Elements must strictly utilize the 'Google Sans' font family configuration, rendering textual metadata in standard weight (`font-weight: 400`) and monetary limits, values, or scheduler titles in bold weight (`font-weight: 700`) over flat, pure white interface canvases (#FFFFFF).

---

## 11. Frontend Type Safety & Typography Compliance Guardrails
- **Frontend Type Safety Checklist**: All client-side models, type definitions, and form schemas must mirror the flat root database definitions exactly. Do not allow divergent properties to persist in local interface definitions.
- **Casing & Typography Token Compliance**: Ensure all error-boundary messages, layout components, form text fields, and validation text strings strictly utilize natural Title Case or Sentence Case capitalization rules. Forced uppercase typography overrides are completely banned. All layout blocks must render cleanly in the 'Google Sans' font family configuration, using a weight of 400 for structural description text blocks and 700 exclusively for mathematical counters and submission actions over clean white canvases (#FFFFFF).

---

## 12. Sandbox Placeholder and Greeting Rules
- **No Hardcoded Personal Testing Names**: No personal developer or testing names may be hardcoded as fallback data inside registration views or dashboard greetings. Uninitialized user states must strictly render dynamic placeholder tokens like 'John Doe' or 'Sara Spence'.
- **Empty State Initialization**: All onboarding input fields must initialize with empty data states (""). No hardcoded developer names or test strings may be used as component initial text or default field states.
- **Casing & Typography Token Compliance**: Ensure all form elements, dynamic text updates, and placeholders look clean and follow natural Title Case capitalization ("John Doe" / "Sara Spence"). Forced all-caps parameters are strictly prohibited. Typography must strictly inherit the 'Google Sans' font family configuration, rendering standard regular weights (font-weight: 400) for descriptive labels, input prose, or text body lines, and bold properties (font-weight: 700) exclusively for primary action triggers or dynamic headers resting cleanly over pure white canvases (#FFFFFF).

---

## 13. Master Brand and Marketing Portal Routing Rules
- **Application Official Branding**: The application is officially branded as 'YOUR FINANCES by ME Vantage' with the primary domain yourfinances.me. The master tagline is 'Your Future Financial Freedom starts with YOUR FINANCES'. The domain yourfinances.me serves as an informational marketing landing hub with direct portal pathways to launch the active web dashboard app.
- **Casing & Typography Token Compliance**: All structural card headers, subtext details, navigation metrics, and calculated totals must follow natural Title Case or Sentence Case rules. Forced uppercase text transformations are entirely prohibited (except for explicit stylized brand elements like YOUR FINANCES). All typographic components must inherit the 'Google Sans' font family properties, deploying a clean regular weight (400) for standard descriptions and bold face styling (700) exclusively for primary view titles, logo signatures, master taglines, and computed currency matrices over pure white panel backdrops (#FFFFFF).

---

## 14. Income Tracking Path Branch Selection Stage Rules
- **Safe Tracking Parameter Setup**: The user profile document contains a safe tracking parameter path 'incomeTrackingType' ('payroll' or 'lump_sum') under the flat root of `users/{userId}`. Card A writes 'payroll'; Card B writes 'lump_sum'. No existing core document parameters, timestamps, or personal profiles are modified or damaged.
- **Onboarding Form Routing**: If 'lump_sum' is flagged during registration, the onboarding system router must entirely bypass the corporate salary allocation forms and transition directly into checking account mapping paths (Asset Accounts Manager). If 'payroll' is selected, it routes through the standard payroll configuration forms.
- **Casing & Visual Compliance**: Card selections, title / headers, and buttons must follow Title Case or Sentence Case rules with no forced uppercase letter transformations. All text elements inherit and default to the 'Google Sans' font family configuration, with standard description weights in `font-weight: 400` and headers or action targets in `font-weight: 700` over flat, pure white interface backdrops (#FFFFFF).

---

## 15. 50/30/20 Budget Setup & Interactive Recommendation Rules
- **Interactive Allocation Recommendation**: The miniBudgets setup sequence dynamically enforces the 50/30/20 rule recommendation. Payroll accounts calculate exact currency values automatically, while lump-sum profiles render interactive empty input boxes tied directly to the 50/30/20 ratio definitions.
- **Casing & Typography Token Compliance**: All structural labels, breakdown summaries, card headers, and button layout elements must strictly utilize natural Title Case or Sentence Case rules. Forced uppercase text modifiers are completely banned across the application (except for explicit stylized branding references like YOUR FINANCES). All typography blocks must inherit the 'Google Sans' font family configuration, rendering description paragraphs in regular weight (font-weight: 400) and tracking metrics, title lines, and brand headers ("Your Future Financial Freedom starts with YOUR FINANCES") exclusively in bold (font-weight: 700) over crisp white canvas panel areas (#FFFFFF).
- **Collection Setup & Flat Mutations**: Appended doc structures must sit flatly in the `users/{userId}/miniBudgets/{budgetId}` path and preserve the `categoryGroup` value as `'needs' | 'wants' | 'savings'`.

---

## 16. Ledger-Backed Balance Aggregation Rule
- **Primary Source of Truth**: The `currentBalance` property of any account document (`users/{userId}/accounts/{accountId}`) must be treated as implicitly derived and synchronized in real-time from the ledger of confirmed transactions (`users/{userId}/transactions`).
- **Atomic Balance Updates**: Any operation that creates, updates, or deletes a transaction record impacting an account's balance (expense, income, transfer) MUST be executed using a Firestore atomic transaction (`runTransaction`) to simultaneously update the corresponding `currentBalance` in the account document.
- **Independence from Hardcoding**: Dashboard-side components MUST derive available liquidity metrics by executing reactive queries over the confirmed transaction ledger for that specific account context, rather than trusting static account document fields in isolation.
- **Consistency Verification**: All transaction-registering application services must enforce this dual-write integrity model to prevent sync divergence across the dashboard, account detail views, and income breakdown monitors.

## 17. Account Initialization & Starting Balance Ledger Lifecycle
- **Zero-Sum Initialization**: All newly initialized accounts (Bank, Cash, Investment, Credit/Liability) must explicitly set `startingBalance` and `currentBalance` to Native `0.00`. No initial fund amounts are permitted as static property values in the account document creation payload.
- **Starting Balance Transaction Ledgering**: Capturing user-defined initial setup funds MUST be performed strictly by generating a standalone transaction document of Type: 'income' (classification: 'starting_balance') containing the specified opening amount, atomically linked to the newly created accountId immediately following account instantiation.
- **Single Source of Truth Enforcement**: This ledger-first lifecycle ensures liquidity tracking engines rely entirely on the transaction history array as the absolute source of truth for account balances, eliminating compounding errors and hardcoded property divergence.


## 19. Registration & Onboarding Lifecycle
- **Strict Onboarding Gate**: Initial user account creation (at the point of email/password signup) must only capture minimal authentication credentials (`uid`, `email`) and set `onboardingStatus: false`, `userAcceptedTerms: false`, `subscriptionTier: 'free'`.
- **Deferred Initialization**: Absolutely NO default banking modules, transactions, or asset templates are permitted at signup. These MUST be deferred until the final onboarding step, after explicit user confirmation on the final setup screen.
- **No Affirmative Assumption**: Automatic insertion of subscription tiers, accepted agreement flags, or pre-configured mockup balances is strictly prohibited until a verified user completes the onboarding wizard.

## 20. Credential Protection & Session Security
- **Explicit Password Validation**: Email-based access MUST require password verification for both login and signup.
- **No Bypassing**: Authorization sessions MUST be established through secure Firebase Auth flows (`signInWithEmailAndPassword` or `createUserWithEmailAndPassword`).
- **Authorization Enforcement**: No user state transitions (login, dashboard navigation) shall be authorized without successfully completed password validation.










