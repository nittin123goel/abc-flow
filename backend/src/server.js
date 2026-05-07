import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import adminRouter from './routes/admin.js';
import employeeRouter from './routes/employee.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'abc-cashflow-api' }));

app.use('/api/admin', adminRouter);
app.use('/api', employeeRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✓ ABC Metals API listening on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  CORS:   ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});
