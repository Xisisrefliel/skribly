import { useState } from 'react';
import type { FlashcardDeck } from '@lecture/shared';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  RefreshCw, 
  Check, 
  X,
  Loader2,
  MousePointerClick,
  RotateCw
} from 'lucide-react';
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
    const knownPercentage = Math.round((knownCards.size / deck.cards.length) * 100);
    
    return (
      <Card className="w-full max-w-2xl mx-auto animate-scale-in">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-status-success-soft flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-status-success" />
          </div>
          <CardTitle className="text-2xl">Session Complete!</CardTitle>
          <CardDescription>Great job reviewing your flashcards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 rounded-xl bg-status-success-soft border border-status-success/20">
              <div className="text-3xl font-bold text-status-success">{knownCards.size}</div>
              <p className="text-sm text-muted-foreground mt-1">Cards Known</p>
              <p className="text-xs text-status-success font-medium">{knownPercentage}%</p>
            </div>
            <div className="p-4 rounded-xl bg-status-warning-soft border border-status-warning/20">
              <div className="text-3xl font-bold text-status-warning">{reviewCards.size}</div>
              <p className="text-sm text-muted-foreground mt-1">Need Review</p>
              <p className="text-xs text-status-warning font-medium">{100 - knownPercentage}%</p>
            </div>
          </div>
          
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleRestart} className="neu-button">
              <RotateCcw className="w-4 h-4 mr-2" />
              Start Over
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
                    New Cards
                  </>
                )}
              </Button>
            )}
            <Button onClick={onClose} className="neu-button-primary">
              <Check className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto animate-fade-in-up">
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
          <Button variant="ghost" size="sm" onClick={onClose} className="neu-button-subtle">
            <X className="w-4 h-4 mr-1" />
            Exit
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Flashcard with 3D flip */}
        <div
          onClick={handleFlip}
          onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? handleFlip() : null}
          role="button"
          tabIndex={0}
          aria-label={isFlipped ? `Answer: ${currentCard.back}. Click to show question.` : `Question: ${currentCard.front}. Click to reveal answer.`}
          className="perspective-1000 cursor-pointer outline-none rounded-xl"
        >
          <div className={`flashcard-inner min-h-[250px] ${isFlipped ? 'flipped' : ''}`}>
            {/* Front - Question */}
            <div className="flashcard-face w-full min-h-[250px] p-6 rounded-xl border-2 border-muted-foreground/20 bg-gradient-to-br from-card to-muted/30 flex flex-col items-center justify-center text-center">
              <Badge variant="outline" className="mb-4 text-muted-foreground">
                Question
              </Badge>
              <p className="text-xl font-medium leading-relaxed">
                {currentCard.front}
              </p>
              <div className="flex items-center gap-2 mt-6 text-sm text-muted-foreground">
                <MousePointerClick className="w-4 h-4" />
                <span>Click to reveal answer</span>
              </div>
            </div>
            
            {/* Back - Answer */}
            <div className="flashcard-face flashcard-back w-full min-h-[250px] p-6 rounded-xl border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10 flex flex-col items-center justify-center text-center">
              <Badge className="mb-4 status-info">
                Answer
              </Badge>
              <p className="text-xl font-medium leading-relaxed">
                {currentCard.back}
              </p>
              <div className="flex items-center gap-2 mt-6 text-sm text-muted-foreground">
                <RotateCw className="w-4 h-4" />
                <span>Click to flip back</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className="neu-button"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          {isFlipped && (
            <div className="flex gap-2 animate-scale-in">
              <Button
                className="neu-button-warning"
                onClick={handleMarkReview}
              >
                <X className="w-4 h-4 mr-1" />
                Need Review
              </Button>
              <Button
                className="neu-button-success"
                onClick={handleMarkKnown}
              >
                <Check className="w-4 h-4 mr-1" />
                Got It!
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={goToNext}
            disabled={currentIndex === deck.cards.length - 1}
            className="neu-button"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-status-success" />
            Known: {knownCards.size}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-status-warning" />
            Review: {reviewCards.size}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
