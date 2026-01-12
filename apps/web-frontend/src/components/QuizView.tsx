import { useState } from 'react';
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

  const currentQuestion = quiz.questions[currentIndex];
  const isLastQuestion = currentIndex === quiz.questions.length - 1;
  const progress = ((currentIndex + 1) / quiz.questions.length) * 100;

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
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <div className={cn(
              "text-6xl font-bold",
              isGreatScore ? "text-status-success" : isGoodScore ? "text-status-warning" : "text-primary"
            )}>
              {percentage}%
            </div>
            <p className="text-muted-foreground">
              You got <span className="font-semibold text-foreground">{score}</span> out of <span className="font-semibold text-foreground">{quiz.questions.length}</span> questions correct
            </p>
          </div>
          
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleRestart} className="neu-button">
              <RotateCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            {onRegenerate && (
              <Button variant="outline" onClick={onRegenerate} disabled={isRegenerating} className="neu-button">
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
            <Button onClick={onClose} className="neu-button-primary">
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
                      "p-3 rounded-lg border space-y-1",
                      isCorrect 
                        ? "bg-status-success-soft border-status-success/20" 
                        : "bg-status-error-soft border-status-error/20"
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
      "w-full max-w-2xl mx-auto",
      showCelebration && "animate-celebrate"
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Question {currentIndex + 1} of {quiz.questions.length}</CardTitle>
            <CardDescription>{quiz.title}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="neu-button-subtle">
            <X className="w-4 h-4 mr-1" />
            Exit
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        <h2 className="text-xl font-medium leading-relaxed">{currentQuestion.question}</h2>

        <div className="space-y-2" role="radiogroup" aria-label="Answer options">
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
                  "w-full text-left py-3 px-4 rounded-lg border-2 transition-all duration-200",
                  "focus:outline-none",
                  "disabled:cursor-not-allowed",
                  // Default state
                  !showResult && !isSelected && "border-border bg-card hover:border-primary/50 hover:bg-muted/30",
                  // Selected state (before submission)
                  !showResult && isSelected && "border-primary bg-primary/5 ring-2 ring-primary/20",
                  // Correct answer (after submission)
                  showResult && isCorrect && "border-status-success bg-status-success-soft",
                  // Wrong selection (after submission)
                  isWrongSelection && "border-status-error bg-status-error-soft",
                  // Unselected wrong answers (after submission)
                  showResult && !isCorrect && !isSelected && "border-border bg-muted/30 opacity-60"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-medium",
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
                    "flex-1",
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

        {showResult && (
          <div className={cn(
            "p-4 rounded-lg border animate-fade-in-up",
            selectedAnswer === currentQuestion.correctAnswer 
              ? "bg-status-success-soft border-status-success/20" 
              : "bg-status-error-soft border-status-error/20"
          )}>
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
                <p className="font-medium mb-1">
                  {selectedAnswer === currentQuestion.correctAnswer ? 'Correct!' : 'Incorrect'}
                </p>
                <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          {!showResult ? (
            <Button 
              onClick={handleSubmitAnswer} 
              disabled={selectedAnswer === null}
              className="neu-button-primary"
            >
              <Check className="w-4 h-4 mr-2" />
              Check Answer
            </Button>
          ) : (
            <Button onClick={handleNext} className="neu-button-primary">
              {isLastQuestion ? 'See Results' : 'Next Question'}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
