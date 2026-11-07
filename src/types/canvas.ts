// Canvas LMS API Type Definitions

export interface Course {
  id: number;
  name: string;
  course_code: string;
  workflow_state: 'unpublished' | 'available' | 'completed' | 'deleted';
  account_id: number;
  root_account_id: number;
  enrollment_term_id: number;
  start_at: string | null;
  end_at: string | null;
  enrollments?: Enrollment[];
  total_students?: number;
  calendar?: CalendarLink;
  default_view: 'feed' | 'wiki' | 'modules' | 'assignments' | 'syllabus';
  syllabus_body?: string;
  needs_grading_count?: number;
  term?: Term;
  apply_assignment_group_weights: boolean;
  public_description?: string;
  time_zone?: string;
}

export interface Term {
  id: number;
  name: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CalendarLink {
  ics: string;
}

export interface Enrollment {
  type: string;
  role: string;
  role_id: number;
  user_id: number;
  enrollment_state: 'active' | 'invited' | 'inactive' | 'completed' | 'rejected';
  computed_current_score?: number;
  computed_final_score?: number;
  computed_current_grade?: string;
  computed_final_grade?: string;
}

export interface Assignment {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  has_overrides: boolean;
  course_id: number;
  html_url: string;
  submissions_download_url: string;
  assignment_group_id: number;
  due_date_required: boolean;
  allowed_extensions?: string[];
  max_name_length: number;
  points_possible: number;
  submission_types: SubmissionType[];
  has_submitted_submissions: boolean;
  grading_type: GradingType;
  grading_standard_id: number | null;
  published: boolean;
  unpublishable: boolean;
  only_visible_to_overrides: boolean;
  locked_for_user: boolean;
  lock_info?: LockInfo;
  lock_explanation?: string;
  submission?: Submission;
  use_rubric_for_grading?: boolean;
  rubric_settings?: RubricSettings;
  rubric?: RubricCriteria[];
  allowed_attempts: number;
  post_manually: boolean;
  anonymous_grading: boolean;
  omit_from_final_grade: boolean;
}

export type SubmissionType = 
  | 'online_text_entry'
  | 'online_url'
  | 'online_upload'
  | 'online_quiz'
  | 'media_recording'
  | 'student_annotation'
  | 'discussion_topic'
  | 'external_tool'
  | 'on_paper'
  | 'none';

export type GradingType = 
  | 'pass_fail'
  | 'percent'
  | 'letter_grade'
  | 'gpa_scale'
  | 'points'
  | 'not_graded';

export interface LockInfo {
  asset_string: string;
  unlock_at?: string;
  lock_at?: string;
  context_module?: object;
  manually_locked: boolean;
}

export interface RubricSettings {
  id?: number;
  title?: string;
  points_possible: number;
  free_form_criterion_comments?: boolean;
}

export interface RubricCriteria {
  id: string;
  points: number;
  description: string;
  long_description?: string;
  criterion_use_range: boolean;
  ratings: RubricRating[];
  learning_outcome_id?: string;
  ignore_for_scoring?: boolean;
}

export interface RubricRating {
  id: string;
  points: number;
  description: string;
  long_description?: string;
}

export interface Submission {
  id: number;
  assignment_id: number;
  user_id: number;
  submitted_at: string | null;
  attempt: number | null;
  body: string | null;
  grade: string | null;
  score: number | null;
  submission_type: SubmissionType | null;
  workflow_state: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';
  grade_matches_current_submission: boolean;
  graded_at: string | null;
  grader_id: number | null;
  late: boolean;
  missing: boolean;
  excused: boolean;
  late_policy_status: string | null;
  points_deducted: number | null;
  preview_url: string;
  submission_comments?: SubmissionComment[];
  attachments?: FileAttachment[];
  url?: string;
}

export interface SubmissionComment {
  id: number;
  author_id: number;
  author_name: string;
  author: User;
  comment: string;
  created_at: string;
  edited_at: string | null;
  media_comment?: MediaComment;
}

export interface MediaComment {
  content_type: string;
  display_name: string;
  media_id: string;
  media_type: 'audio' | 'video';
  url: string;
}

export interface User {
  id: number;
  name: string;
  sortable_name?: string;
  short_name?: string;
  login_id?: string;
  avatar_url?: string;
  email?: string;
}

export interface FileAttachment {
  id: number;
  uuid: string;
  folder_id: number;
  display_name: string;
  filename: string;
  content_type: string;
  url: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  require_sequential_progress: boolean;
  prerequisite_module_ids: number[];
  items_count: number;
  items_url: string;
  items?: ModuleItem[];
  state?: 'locked' | 'unlocked' | 'started' | 'completed';
  completed_at?: string | null;
  publish_final_grade?: boolean;
  published?: boolean;
}

export interface ModuleItem {
  id: number;
  module_id: number;
  position: number;
  title: string;
  indent: number;
  type: ModuleItemType;
  content_id?: number;
  html_url?: string;
  url?: string;
  page_url?: string;
  external_url?: string;
  new_tab?: boolean;
  completion_requirement?: CompletionRequirement;
  content_details?: ContentDetails;
  published?: boolean;
}

export type ModuleItemType = 
  | 'File'
  | 'Page'
  | 'Discussion'
  | 'Assignment'
  | 'Quiz'
  | 'SubHeader'
  | 'ExternalUrl'
  | 'ExternalTool';

export interface CompletionRequirement {
  type: 'must_view' | 'must_submit' | 'must_contribute' | 'min_score' | 'must_mark_done';
  min_score?: number;
  completed?: boolean;
}

export interface ContentDetails {
  points_possible?: number;
  due_at?: string;
  unlock_at?: string;
  lock_at?: string;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  html_url: string;
  posted_at: string;
  delayed_post_at: string | null;
  context_code: string;
  user_name: string;
  topic_children: number[];
  attachments?: FileAttachment[];
  author: User;
  read_state?: 'read' | 'unread';
}

export interface DiscussionTopic {
  id: number;
  title: string;
  message: string;
  html_url: string;
  posted_at: string;
  last_reply_at: string | null;
  require_initial_post: boolean;
  user_can_see_posts: boolean;
  discussion_subentry_count: number;
  read_state: 'read' | 'unread';
  unread_count: number;
  subscribed: boolean;
  assignment_id: number | null;
  delayed_post_at: string | null;
  published: boolean;
  lock_at: string | null;
  locked: boolean;
  pinned: boolean;
  locked_for_user: boolean;
  lock_info?: LockInfo;
  lock_explanation?: string;
  user_name: string;
  author: User;
  attachments?: FileAttachment[];
  permissions?: {
    attach: boolean;
    update: boolean;
    reply: boolean;
    delete: boolean;
  };
}

export interface DiscussionEntry {
  id: number;
  user_id: number;
  user_name: string;
  user: User;
  message: string;
  read_state: 'read' | 'unread';
  forced_read_state: boolean;
  created_at: string;
  updated_at: string;
  attachment?: FileAttachment;
  recent_replies?: DiscussionEntry[];
  has_more_replies?: boolean;
}

// API Request/Response types
export interface Page {
  page_id: number;
  url: string;
  title: string;
  created_at: string;
  updated_at: string;
  editing_roles?: string;
  last_edited_by?: User;
  body?: string;
  published: boolean;
  front_page: boolean;
  hide_from_students?: boolean;
  locked_for_user?: boolean;
  lock_info?: LockInfo;
  lock_explanation?: string;
  html_url?: string;
  todo_date?: string | null;
}

export interface CanvasFile {
  id: number;
  folder_id: number;
  display_name: string;
  filename: string;
  // Canvas returns this key hyphenated on the files endpoints.
  'content-type': string;
  url: string;
  size: number;
  created_at: string;
  updated_at: string;
  modified_at?: string;
  unlock_at?: string | null;
  lock_at?: string | null;
  locked: boolean;
  hidden: boolean;
  hidden_for_user?: boolean;
  locked_for_user?: boolean;
  lock_explanation?: string;
  mime_class?: string;
  upload_status?: string;
  thumbnail_url?: string | null;
}

export interface ListFilesParams {
  search_term?: string;
  content_types?: string[];
  sort?: 'name' | 'size' | 'created_at' | 'updated_at' | 'content_type';
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  link?: {
    current?: string;
    next?: string;
    prev?: string;
    first?: string;
    last?: string;
  };
}

export interface FileUploadParams {
  name: string;
  size: number;
  content_type: string;
  parent_folder_path?: string;
  on_duplicate?: 'overwrite' | 'rename';
}

export interface FileUploadResponse {
  upload_url: string;
  upload_params: Record<string, string>;
  file_param: string;
}

export interface SubmitAssignmentParams {
  submission_type: SubmissionType;
  body?: string;
  url?: string;
  file_ids?: number[];
}

// Query parameter types
export interface ListCoursesParams {
  enrollment_type?: 'teacher' | 'student' | 'ta' | 'observer' | 'designer';
  enrollment_state?: 'active' | 'invited_or_pending' | 'completed';
  state?: ('unpublished' | 'available' | 'completed' | 'deleted')[];
  include?: ('needs_grading_count' | 'syllabus_body' | 'total_scores' | 'term' | 'course_progress' | 'sections' | 'total_students')[];
}

export interface ListAssignmentsParams {
  include?: ('submission' | 'assignment_visibility' | 'all_dates' | 'overrides' | 'score_statistics')[];
  search_term?: string;
  bucket?: 'past' | 'overdue' | 'undated' | 'ungraded' | 'unsubmitted' | 'upcoming' | 'future';
  assignment_ids?: number[];
  order_by?: 'position' | 'name' | 'due_at';
}

export interface ListModulesParams {
  include?: ('items' | 'content_details')[];
  search_term?: string;
  student_id?: number;
}

export interface ListPagesParams {
  search_term?: string;
  sort?: 'title' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
  published?: boolean;
}

export interface ListAnnouncementsParams {
  context_codes: string[];
  start_date?: string;
  end_date?: string;
  active_only?: boolean;
  latest_only?: boolean;
}
