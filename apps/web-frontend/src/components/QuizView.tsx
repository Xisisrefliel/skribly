import { useState, useEffect, useRef } from 'react';
import type { Quiz } from '@lecture/shared';
import { 
  Check, 
  X, 
  ChevronRight, 
  RotateCcw, 
  RefreshCw, 
  Loader2,
  Trophy,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface QuizViewProps {
  quiz: Quiz;
  onClose: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function QuizView({ quiz, onClose, onRegenerate, isRegenerating }: QuizViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(quiz.questions.length).fill(null));
  const [showCelebration, setShowCelebration] = useState(false);
  const [isSavingAttempt, setIsSavingAttempt] = useState(false);
  const attemptSavedRef = useRef(false);

  const currentQuestion = quiz.questions[currentIndex];
  const isLastQuestion = currentIndex === quiz.questions.length - 1;
  const progress = ((currentIndex + 1) / quiz.questions.length) * 100;

  // Save quiz attempt when quiz is completed (currentIndex === -1)
  useEffect(() => {
    if (currentIndex === -1 && !attemptSavedRef.current) {
      attemptSavedRef.current = true;
      setIsSavingAttempt(true);
      
      // Convert answers to non-null array (defaulting to -1 for unanswered)
      const finalAnswers = answers.map(a => a ?? -1);
      
      api.saveQuizAttempt({
        quizId: quiz.id,
        score,
        totalQuestions: quiz.questions.length,
        answers: finalAnswers,
      })
        .then(() => {
          console.log('Quiz attempt saved successfully');
        })
        .catch((error) => {
          console.error('Failed to save quiz attempt:', error);
        })
        .finally(() => {
          setIsSavingAttempt(false);
        });
    }
  }, [currentIndex, answers, quiz.id, quiz.questions.length, score]);

  const handleSelectAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    const newAnswers = [...answers];
    newAnswers[currentIndex] = index;
    setAnswers(newAnswers);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    
    if (selectedAnswer === currentQuestion.correctAnswer) {
      setScore(score + 1);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 500);
    }
    setShowResult(true);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      // Show final results
      setCurrentIndex(-1);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(answers[currentIndex + 1]);
      setShowResult(answers[currentIndex + 1] !== null);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setAnswers(new Array(quiz.questions.length).fill(null));
    attemptSavedRef.current = false;
  };

  // Final results view
  if (currentIndex === -1) {
    const percentage = Math.round((score / quiz.questions.length) * 100);
    const isGreatScore = percentage >= 80;
    const isGoodScore = percentage >= 60;
    
    return (
      <Card className="w-full max-w-2xl mx-auto animate-scale-in">
        <CardHeader className="text-center">
          <div className={cn(
            "mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4",
            isGreatScore ? "bg-status-success-soft" : isGoodScore ? "bg-status-warning-soft" : "bg-status-info-soft"
          )}>
            <Trophy className={cn(
              "w-10 h-10",
              isGreatScore ? "text-status-success" : isGoodScore ? "text-status-warning" : "text-status-info"
            )} />
          </div>
          <CardTitle className="text-2xl">Quiz Complete!</CardTitle>
          <CardDescription>Here's how you did</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <div className="text-center space-y-2">
            <div className={cn(
              "text-5xl sm:text-6xl font-bold",
              isGreatScore ? "text-status-success" : isGoodScore ? "text-status-warning" : "text-primary"
            )}>
              {percentage}%
            </div>
            <p className="text-muted-foreground">
              You got <span className="font-semibold text-foreground">{score}</span> out of <span className="font-semibold text-foreground">{quiz.questions.length}</span> questions correct
            </p>
            {isSavingAttempt && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving result...
              </p>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 px-4 sm:px-0">
            <Button variant="outline" onClick={handleRestart} className="neu-button w-full sm:w-auto">
              <RotateCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            {onRegenerate && (
              <Button variant="outline" onClick={onRegenerate} disabled={isRegenerating} className="neu-button w-full sm:w-auto">
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    New Questions
                  </>
                )}
              </Button>
            )}
            <Button onClick={onClose} className="neu-button-primary w-full sm:w-auto">
              <Check className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>

          {/* Review answers */}
          <div className="space-y-3 mt-8">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Review Answers</h3>
            <div className="space-y-2">
              {quiz.questions.map((q, i) => {
                const isCorrect = answers[i] === q.correctAnswer;
                return (
                  <div 
                    key={q.id} 
                    className={cn(
                      "p-3 rounded-xl border space-y-1 transition-all duration-200",
                      isCorrect 
                        ? "bg-status-success-soft border-status-success/30" 
                        : "bg-status-error-soft border-status-error/30"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        "mt-0.5 flex-shrink-0",
                        isCorrect ? "text-status-success" : "text-status-error"
                      )}>
                        {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>
                      <span className="text-sm font-medium">{q.question}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      Correct answer: {q.options[q.correctAnswer]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "w-full max-w-2xl mx-auto border-0 sm:border shadow-none sm:shadow-sm",
      showCelebration && "animate-celebrate"
    )}>
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4 overflow-hidden">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex-1 min-w-0 mr-2">
            <CardTitle className="text-base sm:text-lg truncate pr-1">Question {currentIndex + 1} of {quiz.questions.length}</CardTitle>
            <p className="text-xs sm:text-sm mt-1 text-muted-foreground truncate max-w-full">
              {quiz.title}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="neu-button-subtle shrink-0 px-2 h-8">
            <X className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Exit</span>
          </Button>
        </div>
        <Progress value={progress} className="h-2 w-full" />
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
        <h2 className="text-lg sm:text-xl font-medium leading-relaxed">{currentQuestion.question}</h2>

        <div className="space-y-3" role="radiogroup" aria-label="Answer options">
          {currentQuestion.options.map((option, index) => {
            const isSelected = index === selectedAnswer;
            const isCorrect = index === currentQuestion.correctAnswer;
            const isWrongSelection = showResult && isSelected && !isCorrect;
            
            return (
                <button
                key={index}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={showResult}
                onClick={() => handleSelectAnswer(index)}
                className={cn(
                  "w-full text-left py-3 px-3 sm:px-4 rounded-xl border-2 transition-all duration-200",
                  "focus:outline-none min-h-[3.5rem]",
                  "disabled:cursor-not-allowed",
                  // Default state
                  !showResult && !isSelected && "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
                  // Selected state (before submission)
                  !showResult && isSelected && "border-primary bg-primary/8 ring-2 ring-primary/25",
                  // Correct answer (after submission)
                  showResult && isCorrect && "border-status-success bg-status-success-soft",
                  // Wrong selection (after submission)
                  isWrongSelection && "border-status-error bg-status-error-soft",
                  // Unselected wrong answers (after submission)
                  showResult && !isCorrect && !isSelected && "border-border bg-muted/40 opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    "flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-medium mt-0.5",
                    !showResult && !isSelected && "border-muted-foreground/30 text-muted-foreground",
                    !showResult && isSelected && "border-primary bg-primary text-primary-foreground",
                    showResult && isCorrect && "border-status-success bg-status-success text-white",
                    isWrongSelection && "border-status-error bg-status-error text-white",
                    showResult && !isCorrect && !isSelected && "border-muted-foreground/20 text-muted-foreground"
                  )}>
                    {showResult && isCorrect ? (
                      <Check className="w-4 h-4" />
                    ) : isWrongSelection ? (
                      <X className="w-4 h-4" />
                    ) : (
                      String.fromCharCode(65 + index)
                    )}
                  </span>
                  <span className={cn(
                    "flex-1 text-sm sm:text-base pt-0.5",
                    showResult && isCorrect && "font-medium text-status-success",
                    isWrongSelection && "text-status-error"
                  )}>
                    {option}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
      
      {/* Footer / Feedback Section */}
      <div className={cn(
        "sticky bottom-0 border-t z-10 transition-all duration-200",
        "p-4 -mx-4 -mb-4 sm:p-6 sm:mx-0 sm:mb-0 sm:rounded-b-xl", // Mobile: negative margins to flush, no radius. Desktop: rounded bottom.
        showResult 
          ? (selectedAnswer === currentQuestion.correctAnswer 
              ? "bg-status-success-soft border-status-success/30" 
              : "bg-status-error-soft border-status-error/30")
          : "bg-card/90 backdrop-blur-sm border-border/50 sm:bg-transparent sm:border-0"
      )}>
        {showResult ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex-shrink-0 mt-0.5",
                selectedAnswer === currentQuestion.correctAnswer ? "text-status-success" : "text-status-error"
              )}>
                {selectedAnswer === currentQuestion.correctAnswer ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className={cn("font-medium", selectedAnswer === currentQuestion.correctAnswer ? "text-status-success" : "text-status-error")}>
                  {selectedAnswer === currentQuestion.correctAnswer ? 'Correct!' : 'Incorrect'}
                </p>
                <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
              </div>
            </div>
            
            <Button 
              onClick={handleNext} 
              className={cn(
                "w-full sm:w-auto shadow-sm",
                selectedAnswer === currentQuestion.correctAnswer ? "neu-button-success" : "neu-button-destructive"
              )}
            >
              {isLastQuestion ? 'See Results' : 'Next Question'}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button 
              onClick={handleSubmitAnswer} 
              disabled={selectedAnswer === null}
              className="neu-button-primary w-full sm:w-auto shadow-sm"
            >
              <Check className="w-4 h-4 mr-2" />
              Check Answer
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
