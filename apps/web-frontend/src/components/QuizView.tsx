import { useState } from 'react';
import type { Quiz } from '@lecture/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

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
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Quiz Complete!</CardTitle>
          <CardDescription>Here's how you did</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <div className="text-6xl font-bold text-primary">{percentage}%</div>
            <p className="text-muted-foreground">
              You got {score} out of {quiz.questions.length} questions correct
            </p>
          </div>
          
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleRestart}>
              Try Again
            </Button>
            {onRegenerate && (
              <Button variant="outline" onClick={onRegenerate} disabled={isRegenerating}>
                {isRegenerating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Regenerating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    New Questions
                  </>
                )}
              </Button>
            )}
            <Button onClick={onClose}>
              Done
            </Button>
          </div>

          {/* Review answers */}
          <div className="space-y-3 mt-6">
            <h3 className="font-semibold">Review Answers</h3>
            {quiz.questions.map((q, i) => (
              <div key={q.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-start gap-2">
                  <Badge variant={answers[i] === q.correctAnswer ? 'default' : 'destructive'} className="mt-0.5">
                    {answers[i] === q.correctAnswer ? 'Correct' : 'Wrong'}
                  </Badge>
                  <span className="text-sm">{q.question}</span>
                </div>
                <p className="text-xs text-muted-foreground ml-14">
                  Correct: {q.options[q.correctAnswer]}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Question {currentIndex + 1} of {quiz.questions.length}</CardTitle>
            <CardDescription>{quiz.title}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Exit
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        <h2 className="text-xl font-medium">{currentQuestion.question}</h2>

        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => {
            let variant: 'outline' | 'default' | 'destructive' = 'outline';
            let className = 'w-full justify-start text-left h-auto py-3 px-4';
            
            if (showResult) {
              if (index === currentQuestion.correctAnswer) {
                className += ' border-green-500 bg-green-50 dark:bg-green-950';
              } else if (index === selectedAnswer && index !== currentQuestion.correctAnswer) {
                className += ' border-red-500 bg-red-50 dark:bg-red-950';
              }
            } else if (index === selectedAnswer) {
              className += ' border-primary bg-primary/5';
            }

            return (
              <Button
                key={index}
                variant={variant}
                className={className}
                onClick={() => handleSelectAnswer(index)}
                disabled={showResult}
              >
                <span className="font-medium mr-3">{String.fromCharCode(65 + index)}.</span>
                {option}
              </Button>
            );
          })}
        </div>

        {showResult && (
          <div className={`p-4 rounded-lg ${
            selectedAnswer === currentQuestion.correctAnswer 
              ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
          }`}>
            <p className="font-medium mb-1">
              {selectedAnswer === currentQuestion.correctAnswer ? 'Correct!' : 'Incorrect'}
            </p>
            <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          {!showResult ? (
            <Button onClick={handleSubmitAnswer} disabled={selectedAnswer === null}>
              Check Answer
            </Button>
          ) : (
            <Button onClick={handleNext}>
              {isLastQuestion ? 'See Results' : 'Next Question'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
