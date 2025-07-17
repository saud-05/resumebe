import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import resumeRoute from './route/resumeRoute.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(morgan('dev'));
app.use(cors({
  origin: 'https://resume-beta-five-32.vercel.app',
}));

app.use(express.json());
app.use('/api/resumes', resumeRoute);

app.get('/', (req, res) => {
  res.send('Backend is running!');
});
app.get('/edit/:id', (req, res) => {
  const id = req.params.id;
  res.send(`Editing item with id: ${id}`);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
