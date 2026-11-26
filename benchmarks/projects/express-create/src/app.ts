import express from 'express';
import { customerRouter } from './create-customer';

const app = express();
app.use(express.json());
app.use('/v1', customerRouter);

export default app;
