import { one, all } from './db.js';
import { fail } from './http.js';

export const isAdmin = (u) => u.role === 'admin';
export const isTeacher = (u) => u.role === 'enseignant';
export const isStudent = (u) => u.role === 'etudiant';

export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) fail(403, 'Accès refusé.');
}

export function getCourse(id) {
  const course = one('SELECT * FROM courses WHERE id = ?', id);
  if (!course) fail(404, 'Cours introuvable.');
  return course;
}

export function isEnrolled(courseId, studentId) {
  return !!one('SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ?', courseId, studentId);
}

/** Admin, the course's teacher, or an enrolled student. Returns the course. */
export function requireCourseAccess(user, courseId) {
  const course = getCourse(courseId);
  if (isAdmin(user)) return course;
  if (isTeacher(user) && course.teacher_id === user.id) return course;
  if (isStudent(user) && isEnrolled(course.id, user.id)) return course;
  fail(403, 'Vous n’avez pas accès à ce cours.');
}

/** Admin or the course's teacher. Returns the course. */
export function requireCourseManager(user, courseId) {
  const course = getCourse(courseId);
  if (isAdmin(user) || (isTeacher(user) && course.teacher_id === user.id)) return course;
  fail(403, 'Seul l’enseignant du cours peut faire cette action.');
}

export function canManageCourse(user, course) {
  return isAdmin(user) || (isTeacher(user) && course.teacher_id === user.id);
}

/** IDs of courses visible to the user (null = every course, for admins). */
export function visibleCourseIds(user) {
  if (isAdmin(user)) return null;
  if (isTeacher(user)) return all('SELECT id FROM courses WHERE teacher_id = ?', user.id).map((r) => r.id);
  return all('SELECT course_id AS id FROM enrollments WHERE student_id = ?', user.id).map((r) => r.id);
}

/** Can `user` see the student file of `studentId`? Teachers: only students in one of their courses. */
export function requireStudentFileAccess(user, studentId) {
  const student = one("SELECT * FROM users WHERE id = ? AND role = 'etudiant'", studentId);
  if (!student) fail(404, 'Étudiant introuvable.');
  if (isAdmin(user) || user.id === student.id) return student;
  if (isTeacher(user)) {
    const shared = one(
      `SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = ? AND c.teacher_id = ? LIMIT 1`,
      studentId,
      user.id,
    );
    if (shared) return student;
  }
  fail(403, 'Accès refusé à ce dossier.');
}

export function inList(ids) {
  return ids.length ? ids.map(() => '?').join(',') : 'NULL';
}
