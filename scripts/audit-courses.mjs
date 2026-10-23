import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { courses, getCourseData } from '../src/data/catalog.js';
import { auditBank } from './audit-bank.mjs';

const reports = await Promise.all(courses.filter(course => course.id !== '15042').map(async course => {
  const { questions, topics, chapters } = getCourseData(course.id);
  const report = auditBank({ questions, topics, chapters, courseId: course.id });
  const path = `src/data/courses/${course.id}.js`;
  const sha256 = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
  const review = await readFile(new URL(`../research/review-course-${course.id}.md`, import.meta.url), 'utf8');
  const reviewMatches = review.includes(sha256);
  if (!reviewMatches) report.errors.push('当前题库指纹未出现在独立内容审查记录中');
  if (questions.some(question => question.reviewStatus !== 'checked')) report.errors.push('含有尚未完成独立内容复核的题目');
  return { courseId: course.id, name: course.name, ...report, passed: report.errors.length === 0, fingerprint: { path, sha256, reviewMatches } };
}));
const result = { generatedAt: new Date().toISOString(), passed: reports.every(report => report.passed), courses: reports };
await writeFile(new URL('../research/course-audit.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: result.passed, courses: reports.map(({ courseId, counts, errors, warnings }) => ({ courseId, counts, errors, warnings })) }, null, 2));
if (!result.passed) process.exitCode = 1;
