import { useTheme } from 'next-themes';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Copy } from '../Copy';

interface CodeProps {
  className?: string;
  children?: any;
  [key: string]: any;
}

export const Code = ({ className, children, ...props }: CodeProps) => {
  const { theme } = useTheme()
  
  if (!children) return null;
  
  const match = /language-(\w+)/.exec(className || '');
  
  const shouldHighlight = !className || className?.includes('language-') || className?.includes('hljs');
  
  const isCodeBlock = shouldHighlight && (String(children).includes('\n') || (className && className.includes('language-')));
  
  return isCodeBlock ? (
    // data-reveal + hover-only-on-fine: the copy button used to be `opacity-0`
    // behind a hover, so a code block could not be copied on a touch device.
    <div data-reveal className="relative group">
      <Copy content={String(children).replace(/\n$/, '')} size={16} className="absolute right-2 top-2 hover-only-on-fine transition-opacity" />
      <SyntaxHighlighter
        {...props}
        PreTag="div"
        children={String(children).replace(/\n$/, '')}
        language={match ? match[1] : 'text'}
        customStyle={{
          borderRadius: '16px',
        }}
        style={theme == 'light' ? oneLight : vscDarkPlus}
      />
    </div>
  ) : (
    <code className={`${className || ''} px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800`} {...props}>
      {children}
    </code>
  );
}; 