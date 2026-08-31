# Database-only payment approval

Users create an order, pay the displayed amount, and submit their UPI transaction reference. Their order then appears in the admin-only database view:

```sql
SELECT * FROM "PlatformPaymentReviewQueue";
```

After matching the amount and transaction reference against the bank/UPI app, approve the exact order from the database console:

```sql
SELECT * FROM public.approve_platform_subscription(
  'ORDER_ID_FROM_THE_QUEUE',
  'admin-name',
  'Payment matched in UPI'
);
```

To reject an unmatched payment:

```sql
SELECT * FROM public.reject_platform_subscription(
  'ORDER_ID_FROM_THE_QUEUE',
  'admin-name',
  'Reference not found in UPI'
);
```

Approval sets the plan active for 30 days and records who approved it and when. These functions must be executed only with the administrator database account; they are not exposed through the PodLive API.
