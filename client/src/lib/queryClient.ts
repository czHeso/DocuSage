import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorData: any;
    try {
      // First try to parse it as JSON
      errorData = await res.json();
    } catch {
      // If that fails, handle it as text
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
    
    // Create the error message
    const errorMessage = errorData.message || `${res.status}: Unknown error`;
    
    // Create an error object with extended properties
    const error = new Error(errorMessage);
    
    // Add the inactive-account flag if present
    if (errorData.inactive) {
      (error as any).inactive = true;
    }
    
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  isFormData: boolean = false
): Promise<Response> {
  console.log(`Making ${method} request to ${url}`, data ? "with data" : "without data");
  
  const headers: Record<string, string> = {
    "Cache-Control": "no-cache",
  };
  
  if (data && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? data as FormData : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
  });

  try {
    await throwIfResNotOk(res);
    console.log(`${method} request to ${url} successful`);
    return res;
  } catch (error) {
    console.error(`${method} request to ${url} failed:`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    console.log("Executing query:", queryKey[0]);
    const res = await fetch(queryKey[0] as string, {
      method: "GET",
      credentials: "include", // This is critical for sending and receiving cookies
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      }
    });

    if (res.status === 401) {
      console.log("Unauthorized response for query:", queryKey[0]);
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
