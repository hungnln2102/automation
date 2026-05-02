# Backend Documentation

## Architecture Overview

Backend được xây dựng với Express.js theo mô hình MVC, sử dụng PostgreSQL làm database.

## Directory Structure

```
src/
├── config/              # Configuration files
│   ├── appConfig.js     # App-level config (CORS, session, etc.)
│   ├── database.js      # Database connection config
│   └── dbSchema.js      # Database schema definitions
├── controllers/         # Route controllers (business logic)
│   ├── Order/           # Order management (crud, list, renew, helpers, …)
│   ├── AuthController/
│   ├── DashboardController/
│   └── ...
├── middleware/          # authGuard, errorHandler, validateRequest, rateLimiter, csrfProtection
├── routes/              # API route definitions
│   ├── index.js         # Main router (auth, system, then authGuard, then feature routes)
│   ├── systemRoutes.js  # error-report; run-due-notification cần CRON_INVOKE_SECRET
│   ├── ordersRoutes.js
│   └── ...
├── scheduler/           # Cron jobs (đơn hết hạn, thông báo Telegram)
│   ├── config.js        # pool, timezone, cron expression, getSqlCurrentDate
│   ├── sqlHelpers.js    # COL, TABLES, normalizeDateSQL, expiryDateSQL
│   ├── tasks/           # updateDatabaseTask, notifyZeroDays, notifyFourDays
│   └── index.js         # Wire cron schedules, exports for SchedulerController
├── schema/              # tables.js (re-export dbSchema)
├── services/            # idService, orderService, telegramOrderNotification, …
├── utils/               # orderHelpers, logger, normalizers, backupService, …
├── db/                  # Knex instance
├── app.js               # Express app configuration
└── server.js            # Server entry point (app.listen + sepay webhook)
```

Root-level (backend/):
- `src/server.js` → entry mặc định (`npm start`, `npm run dev`)
- `index.js` → shim tương thích (`require("./src/server")`) nếu deploy vẫn gọi `node index.js`
- `helpers.js` → re-exports `src/utils/orderHelpers`
- `scheduler.js` → re-exports `src/scheduler`
- `webhook/` → Sepay webhook server

## Key Components

### Controllers

Controllers xử lý business logic cho từng resource. Mỗi controller có thể có:
- Route handlers
- Helper functions
- Service functions

**Example**: `controllers/Order/`
- `index.js` - Router setup
- `crudRoutes.js` - CRUD operations
- `listRoutes.js` - List/filter operations
- `helpers.js` - Helper functions
- `constants.js` - Constants

### Middleware

#### authGuard.js
Bảo vệ routes yêu cầu authentication. Một số routes được exempt (AUTH_OPEN_PATHS).

#### errorHandler.js
Centralized error handling với:
- `AppError` class cho operational errors
- `errorHandler` middleware
- `notFoundHandler` cho 404
- `asyncHandler` wrapper cho async routes

#### validateRequest.js
Request validation sử dụng express-validator:
- Validation chains cho common fields
- `validate()` middleware để check results

### Services

#### idService.js
Generate sequential IDs cho tables không có auto-increment.

#### telegramOrderNotification.js
Gửi thông báo đơn hàng mới qua Telegram:
- Format message với HTML
- Tạo QR code thanh toán
- Handle errors gracefully

## Database

### Connection
Sử dụng Knex.js với PostgreSQL:
```javascript
const { db } = require('./db');
```

### Schemas
Database có 3 schemas chính:
- `orders` - Quản lý đơn hàng
- `product` - Quản lý sản phẩm
- `partner` - Quản lý đối tác/nhà cung cấp

### Transactions
Sử dụng transactions cho operations phức tạp:
```javascript
const trx = await db.transaction();
try {
  // operations
  await trx.commit();
} catch (error) {
  await trx.rollback();
}
```

## Error Handling

### AppError Class
```javascript
const { AppError } = require('./middleware/errorHandler');

throw new AppError('Message', 400, 'ERROR_CODE', details);
```

### Async Routes
Wrap async handlers để catch errors:
```javascript
const { asyncHandler } = require('./middleware/errorHandler');

router.get('/path', asyncHandler(async (req, res) => {
  // async code
}));
```

## Validation

### Using Validation Middleware
```javascript
const { validations, validate } = require('./middleware/validateRequest');

router.post('/',
  validations.orderId(),
  validations.customer(),
  validate,
  handler
);
```

### Custom Validations
```javascript
const { body } = require('./middleware/validateRequest');

body('field').custom((value) => {
  // validation logic
  return true;
})
```

## Environment Variables

Tất cả env vars được load từ root `.env` file.

### Required Variables
- `DATABASE_URL` - PostgreSQL connection string
- `FRONTEND_ORIGINS` - CORS allowed origins
- `SESSION_SECRET` - Session encryption key

### Optional Variables
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3001)

Xem `.env.example` để biết danh sách đầy đủ.

## Development

### Hot Reload
```bash
npm run dev  # Uses nodemon
```

### Code Quality
```bash
npm run lint      # Check for issues
npm run lint:fix  # Auto-fix
npm run format    # Format with Prettier
```

### Debugging
Set breakpoints và sử dụng:
```bash
node --inspect src/server.js
```

## Common Tasks

### Adding a New Route
1. Create controller in `controllers/`
2. Create route file in `routes/`
3. Register route in `routes/index.js`
4. Add validation if needed

### Adding Validation
1. Add validation chain in `middleware/validateRequest.js`
2. Use in route handler
3. Add `validate` middleware

### Error Handling
1. Use `AppError` for operational errors
2. Let middleware catch and format errors
3. Log errors with context

## Best Practices

1. **Always use transactions** for multi-step database operations
2. **Validate input** before processing
3. **Use async/await** instead of callbacks
4. **Log errors** with context
5. **Keep controllers thin** - move logic to services
6. **Use constants** instead of magic strings/numbers
7. **Document complex logic** with comments

## Testing

(To be implemented)

## Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use strong `SESSION_SECRET`
- [ ] Configure `COOKIE_SECURE=true`
- [ ] Set up database backups
- [ ] Configure logging
- [ ] Set up monitoring

### Environment-specific Config
```javascript
if (process.env.NODE_ENV === 'production') {
  // production-only code
}
```
