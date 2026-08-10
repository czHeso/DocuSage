import { useEffect, useState } from 'react';
import { useLocation, useRoute, useRouter } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

function ActivateAccount() {
  const [match, params] = useRoute('/activate');
  const [, navigate] = useLocation();
  
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'success' | 'error' | 'loading'>('loading');
  const [message, setMessage] = useState<string>('Verifying the activation token...');
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (!token) {
      setStatus('error');
      setMessage('The activation token is missing. Check that the URL is complete.');
      setIsLoading(false);
      return;
    }
    
    const activateAccount = async () => {
      try {
        const response = await fetch(`/api/activate-account?token=${token}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        const data = await response.json();
        
        if (response.ok) {
          setStatus('success');
          setMessage(data.message || 'Your account has been activated. You can now log in.');
        } else {
          setStatus('error');
          setMessage(data.message || 'An error occurred while activating the account. Please try again later.');
        }
      } catch (error) {
        console.error('Error activating account:', error);
        setStatus('error');
        setMessage('An error occurred while activating the account. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    activateAccount();
  }, []);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Account activation</CardTitle>
          <CardDescription>DocuSage - Email address verification</CardDescription>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <p className="text-center text-muted-foreground">{message}</p>
            </div>
          ) : status === 'success' ? (
            <Alert className="bg-success/20 border-success text-success-foreground">
              <CheckCircle className="h-5 w-5 text-success" />
              <AlertTitle className="ml-2">Account activated!</AlertTitle>
              <AlertDescription className="ml-7 mt-2">
                {message}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-destructive/20 border-destructive text-destructive-foreground">
              <XCircle className="h-5 w-5 text-destructive" />
              <AlertTitle className="ml-2">Activation failed</AlertTitle>
              <AlertDescription className="ml-7 mt-2">
                {message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-center">
          {status === 'success' ? (
            <Button onClick={() => navigate('/auth')} className="w-full">
              Go to sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => navigate('/')} variant="outline" className="w-full">
              Back to home page
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

export default ActivateAccount;