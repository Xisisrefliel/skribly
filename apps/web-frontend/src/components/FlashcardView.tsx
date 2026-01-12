import { useState } from 'react';
import type { FlashcardDeck } from '@lecture/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface FlashcardViewProps {
  deck: FlashcardDeck;
  onClose: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function FlashcardView({ deck, onClose, onRegenerate, isRegenerating }: FlashcardViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [reviewCards, setReviewCards] = useState<Set<string>>(new Set());

  const currentCard = deck.cards[currentIndex];
  const progress = ((currentIndex + 1) / deck.cards.length) * 100;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleMarkKnown = () => {
    setKnownCards(new Set([...knownCards, currentCard.id]));
    reviewCards.delete(currentCard.id);
    setReviewCards(new Set(reviewCards));
    goToNext();
  };

  const handleMarkReview = () => {
    setReviewCards(new Set([...reviewCards, currentCard.id]));
    knownCards.delete(currentCard.id);
    setKnownCards(new Set(knownCards));
    goToNext();
  };

  const goToNext = () => {
    setIsFlipped(false);
    if (currentIndex < deck.cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    setIsFlipped(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setReviewCards(new Set());
  };

  const isComplete = currentIndex === deck.cards.length - 1 && (knownCards.has(currentCard.id) || reviewCards.has(currentCard.id));

  // Summary view
  if (isComplete) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Session Complete!</CardTitle>
          <CardDescription>Great job reviewing your flashcards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-3xl font-bold text-green-600">{knownCards.size}</div>
              <p className="text-sm text-muted-foreground">Cards Known</p>
            </div>
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950">
              <div className="text-3xl font-bold text-amber-600">{reviewCards.size}</div>
              <p className="text-sm text-muted-foreground">Need Review</p>
            </div>
          </div>
          
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleRestart}>
              Start Over
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
                    New Cards
                  </>
                )}
              </Button>
            )}
            <Button onClick={onClose}>
              Done
            </Button>
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
            <CardTitle className="text-lg">Card {currentIndex + 1} of {deck.cards.length}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              {deck.title}
              {currentCard.category && (
                <Badge variant="outline" className="ml-2">{currentCard.category}</Badge>
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Exit
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Flashcard */}
        <div
          onClick={handleFlip}
          className="relative min-h-[250px] cursor-pointer perspective-1000"
        >
          <div
            className={`
              w-full min-h-[250px] p-6 rounded-xl border-2 transition-all duration-300
              flex items-center justify-center text-center
              ${isFlipped 
                ? 'bg-primary/5 border-primary' 
                : 'bg-muted/50 border-muted-foreground/20 hover:border-primary/50'
              }
            `}
          >
            <div className="space-y-2">
              <Badge variant="outline" className="mb-2">
                {isFlipped ? 'Answer' : 'Question'}
              </Badge>
              <p className="text-xl font-medium">
                {isFlipped ? currentCard.back : currentCard.front}
              </p>
              {!isFlipped && (
                <p className="text-sm text-muted-foreground mt-4">
                  Click to reveal answer
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goToPrevious}
            disabled={currentIndex === 0}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </Button>

          {isFlipped && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-amber-500 text-amber-600 hover:bg-amber-50"
                onClick={handleMarkReview}
              >
                Need Review
              </Button>
              <Button
                variant="outline"
                className="border-green-500 text-green-600 hover:bg-green-50"
                onClick={handleMarkKnown}
              >
                Got It!
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={goToNext}
            disabled={currentIndex === deck.cards.length - 1}
          >
            Next
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Known: {knownCards.size}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Review: {reviewCards.size}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
