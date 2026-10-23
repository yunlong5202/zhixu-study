import * as ethics from './curriculum.js';
import * as contemporary from './courses/15040.js';
import * as theory from './courses/15041.js';

const ethicsCourse = ethics.courses.find(course => course.id === '15042');
const datasets = [
  { ...ethics, course: ethicsCourse },
  contemporary,
  theory,
].map(data => ({
  course: { ...data.course, available: true },
  chapters: data.chapters,
  topics: data.topics,
  questions: data.questions,
  sourceInfo: data.sourceInfo,
  bankSummary: {
    topics: data.topics.length,
    indexedQuestions: data.questions.filter(question => question.topicIds?.length).length,
    legacyQuestions: data.questions.filter(question => !question.topicIds?.length).length,
    totalQuestions: data.questions.length,
  },
}));

export const courses = datasets.map(data => data.course);

export function getCourseData(id = '15042') {
  const data = datasets.find(item => item.course.id === id);
  if (!data) throw new RangeError('未找到这门课程');
  return data;
}
