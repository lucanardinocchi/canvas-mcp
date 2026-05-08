import type {
  Course,
  Assignment,
  Submission,
  Module,
  ModuleItem,
  Announcement,
  DiscussionTopic,
  DiscussionEntry,
  FileUploadResponse,
  ListCoursesParams,
  ListAssignmentsParams,
  ListModulesParams,
  ListAnnouncementsParams,
  SubmitAssignmentParams,
  SubmissionType,
} from './types/canvas.js';

interface CanvasClientConfig {
  baseUrl: string;
  apiToken: string;
}

export class CanvasClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(config: CanvasClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiToken = config.apiToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Canvas API error: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    return response.json() as Promise<T>;
  }

  private parseLinkNext(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // Link header format: <url>; rel="next", <url>; rel="last", ...
    const parts = linkHeader.split(',');
    for (const part of parts) {
      const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
      if (match) return match[1];
    }
    return null;
  }

  private async requestAllPages<T>(
    endpoint: string,
    params: object = {}
  ): Promise<T[]> {
    const mergedParams: Record<string, unknown> = { per_page: 100, ...(params as Record<string, unknown>) };
    const initialQuery = this.buildQueryString(mergedParams);
    let url: string | null = `${this.baseUrl}/api/v1${endpoint}${initialQuery}`;

    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    const results: T[] = [];

    while (url) {
      const response: Response = await fetch(url, { headers });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Canvas API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
      }

      const page = (await response.json()) as T[];
      if (Array.isArray(page)) {
        results.push(...page);
      }

      url = this.parseLinkNext(response.headers.get('link'));
    }

    return results;
  }

  private buildQueryString(params: object): string {
    const searchParams = new URLSearchParams();
    
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(`${key}[]`, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
    
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  // ==================== COURSES ====================

  async listCourses(params: ListCoursesParams = {}): Promise<Course[]> {
    return this.requestAllPages<Course>('/courses', params);
  }

  async getCourse(courseId: number, include?: string[]): Promise<Course> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Course>(`/courses/${courseId}${query}`);
  }

  // ==================== ASSIGNMENTS ====================

  async listAssignments(
    courseId: number,
    params: ListAssignmentsParams = {}
  ): Promise<Assignment[]> {
    const query = this.buildQueryString(params);
    return this.request<Assignment[]>(
      `/courses/${courseId}/assignments${query}`
    );
  }

  async getAssignment(
    courseId: number,
    assignmentId: number,
    include?: string[]
  ): Promise<Assignment> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Assignment>(
      `/courses/${courseId}/assignments/${assignmentId}${query}`
    );
  }

  // ==================== SUBMISSIONS ====================

  async getSubmission(
    courseId: number,
    assignmentId: number,
    userId: number | 'self' = 'self',
    include?: string[]
  ): Promise<Submission> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}${query}`
    );
  }

  async submitAssignment(
    courseId: number,
    assignmentId: number,
    params: SubmitAssignmentParams
  ): Promise<Submission> {
    const body: Record<string, unknown> = {
      submission: {
        submission_type: params.submission_type,
      },
    };

    if (params.body) {
      body.submission = { ...body.submission as object, body: params.body };
    }
    if (params.url) {
      body.submission = { ...body.submission as object, url: params.url };
    }
    if (params.file_ids) {
      body.submission = { ...body.submission as object, file_ids: params.file_ids };
    }

    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  // ==================== FILE UPLOADS ====================

  async initiateFileUpload(
    courseId: number,
    assignmentId: number,
    fileName: string,
    fileSize: number,
    contentType: string
  ): Promise<FileUploadResponse> {
    return this.request<FileUploadResponse>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: fileName,
          size: fileSize,
          content_type: contentType,
        }),
      }
    );
  }

  async uploadFileToUrl(
    uploadUrl: string,
    uploadParams: Record<string, string>,
    fileContent: Uint8Array | string,
    fileName: string,
    contentType: string
  ): Promise<{ id: number; url: string }> {
    const formData = new FormData();
    
    // Add all upload params from Canvas
    for (const [key, value] of Object.entries(uploadParams)) {
      formData.append(key, value);
    }
    
    // Convert to ArrayBuffer for Blob compatibility
    let arrayBuffer: ArrayBuffer;
    if (typeof fileContent === 'string') {
      const encoder = new TextEncoder();
      arrayBuffer = encoder.encode(fileContent).buffer as ArrayBuffer;
    } else {
      arrayBuffer = fileContent.buffer.slice(
        fileContent.byteOffset,
        fileContent.byteOffset + fileContent.byteLength
      ) as ArrayBuffer;
    }
    
    // Add the file
    const blob = new Blob([arrayBuffer], { type: contentType });
    formData.append('file', blob, fileName);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`File upload error: ${response.status} - ${errorBody}`);
    }

    return response.json();
  }

  // ==================== MODULES ====================

  async listModules(
    courseId: number,
    params: ListModulesParams = {}
  ): Promise<Module[]> {
    const query = this.buildQueryString(params);
    return this.request<Module[]>(`/courses/${courseId}/modules${query}`);
  }

  async getModule(
    courseId: number,
    moduleId: number,
    include?: string[]
  ): Promise<Module> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Module>(
      `/courses/${courseId}/modules/${moduleId}${query}`
    );
  }

  async listModuleItems(
    courseId: number,
    moduleId: number,
    include?: string[]
  ): Promise<ModuleItem[]> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<ModuleItem[]>(
      `/courses/${courseId}/modules/${moduleId}/items${query}`
    );
  }

  // ==================== ANNOUNCEMENTS ====================

  async listAnnouncements(
    params: ListAnnouncementsParams
  ): Promise<Announcement[]> {
    const query = this.buildQueryString(params);
    return this.request<Announcement[]>(`/announcements${query}`);
  }

  // ==================== DISCUSSIONS ====================

  async listDiscussionTopics(
    courseId: number,
    orderBy?: 'position' | 'recent_activity' | 'title'
  ): Promise<DiscussionTopic[]> {
    const query = orderBy ? this.buildQueryString({ order_by: orderBy }) : '';
    return this.request<DiscussionTopic[]>(
      `/courses/${courseId}/discussion_topics${query}`
    );
  }

  async getDiscussionTopic(
    courseId: number,
    topicId: number
  ): Promise<DiscussionTopic> {
    return this.request<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics/${topicId}`
    );
  }

  async listDiscussionEntries(
    courseId: number,
    topicId: number
  ): Promise<DiscussionEntry[]> {
    return this.request<DiscussionEntry[]>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`
    );
  }

  async postDiscussionEntry(
    courseId: number,
    topicId: number,
    message: string
  ): Promise<DiscussionEntry> {
    return this.request<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    );
  }

  async replyToDiscussionEntry(
    courseId: number,
    topicId: number,
    entryId: number,
    message: string
  ): Promise<DiscussionEntry> {
    return this.request<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries/${entryId}/replies`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    );
  }

  // ==================== RUBRICS ====================

  async getRubric(
    courseId: number,
    rubricId: number,
    include?: ('assessments' | 'graded_assessments' | 'peer_assessments' | 'associations' | 'assignment_associations' | 'course_associations' | 'account_associations')[]
  ): Promise<unknown> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<unknown>(
      `/courses/${courseId}/rubrics/${rubricId}${query}`
    );
  }

  // ==================== SEARCH / UTILITY ====================

  async searchCourseContent(
    courseId: number,
    searchTerm: string
  ): Promise<{ modules: Module[]; assignments: Assignment[] }> {
    // Search modules
    const modules = await this.listModules(courseId, {
      search_term: searchTerm,
      include: ['items'],
    });

    // Search assignments
    const assignments = await this.listAssignments(courseId, {
      search_term: searchTerm,
    });

    return { modules, assignments };
  }

  async getUpcomingAssignments(
    courseId: number,
    daysAhead: number = 7
  ): Promise<Assignment[]> {
    const assignments = await this.listAssignments(courseId, {
      bucket: 'upcoming',
      include: ['submission'],
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return assignments.filter(a => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      return dueDate <= cutoffDate;
    });
  }

  async getOverdueAssignments(courseId: number): Promise<Assignment[]> {
    return this.listAssignments(courseId, {
      bucket: 'overdue',
      include: ['submission'],
    });
  }

  async getAssignmentsByDateRange(
    courseId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Assignment[]> {
    const assignments = await this.listAssignments(courseId, {
      include: ['submission'],
    });

    return assignments.filter(a => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      return dueDate >= startDate && dueDate <= endDate;
    });
  }

  // ==================== USER INFO ====================

  async getCurrentUser(): Promise<{ id: number; name: string; email?: string }> {
    return this.request<{ id: number; name: string; email?: string }>('/users/self');
  }
}

// Singleton instance creator
let clientInstance: CanvasClient | null = null;

export function getCanvasClient(): CanvasClient {
  if (!clientInstance) {
    const baseUrl = process.env.CANVAS_BASE_URL;
    const apiToken = process.env.CANVAS_API_TOKEN;

    if (!baseUrl || !apiToken) {
      throw new Error(
        'Missing required environment variables: CANVAS_BASE_URL and CANVAS_API_TOKEN must be set'
      );
    }

    clientInstance = new CanvasClient({ baseUrl, apiToken });
  }

  return clientInstance;
}
