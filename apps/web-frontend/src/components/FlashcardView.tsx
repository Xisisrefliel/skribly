import { useState, useEffect } from 'react';
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
  RotateCw,
  History,
  Calendar,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Drawer } from '@/components/ui/drawer';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';

interface FlashcardViewProps {
  deck: FlashcardDeck;
  decks?: FlashcardDeck[];
  transcriptionId?: string;
  onClose: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  onDeckSelect?: (deck: FlashcardDeck) => void;
}

export function FlashcardView({ 
  deck, 
  decks: initialDecks,
  transcriptionId,
  onClose, 
  onRegenerate, 
  isRegenerating,
  onDeckSelect
}: FlashcardViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [reviewCards, setReviewCards] = useState<Set<string>>(new Set());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [decks, setDecks] = useState<FlashcardDeck[]>(initialDecks || []);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);

  // If initialDecks prop changes, update state
  useEffect(() => {
    if (initialDecks) {
      setDecks(initialDecks);
    }
  }, [initialDecks]);

  // If decks not provided but transcriptionId is, fetch them
  useEffect(() => {
    if (!initialDecks && transcriptionId && decks.length === 0) {
      const fetchDecks = async () => {
        setIsLoadingDecks(true);
        try {
          const response = await api.getFlashcards(transcriptionId);
          if (response && response.decks) {
            setDecks(response.decks);
          } else if (response && response.deck) {
            setDecks([response.deck]);
          }
        } catch (error) {
          console.error("Failed to fetch decks history", error);
        } finally {
          setIsLoadingDecks(false);
        }
      };
      fetchDecks();
    }
  }, [initialDecks, transcriptionId, decks.length]);

  const currentCard = deck.cards[currentIndex];
  // Calculate progress based on cards viewed/acted upon, or simply current position
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

  const handleSelectDeck = (selectedDeck: FlashcardDeck) => {
    if (onDeckSelect) {
      onDeckSelect(selectedDeck);
      handleRestart(); // Reset state for new deck
      setIsDrawerOpen(false);
    }
  };

  const isComplete = currentIndex === deck.cards.length - 1 && (knownCards.has(currentCard.id) || reviewCards.has(currentCard.id));

  // Summary view
  if (isComplete) {
    const knownPercentage = Math.round((knownCards.size / deck.cards.length) * 100);
    
    return (
      <Card className="relative w-full max-w-2xl mx-auto animate-scale-in">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex gap-2 z-10">
          {(decks.length > 0 || onDeckSelect) && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsDrawerOpen(true)} 
              className="neu-button-subtle h-8 w-8"
              title="Flashcard History"
            >
              <History className="w-4 h-4" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="neu-button-subtle h-8 w-8"
            title="Exit"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-status-success-soft flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-status-success" />
          </div>
          <CardTitle className="text-2xl">Session Complete!</CardTitle>
          <CardDescription>Great job reviewing your flashcards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 rounded-xl bg-status-success-soft border border-status-success/30 transition-all duration-200">
              <div className="text-3xl font-bold text-status-success">{knownCards.size}</div>
              <p className="text-sm text-muted-foreground mt-1">Cards Known</p>
              <p className="text-xs text-status-success font-medium">{knownPercentage}%</p>
            </div>
            <div className="p-4 rounded-xl bg-status-warning-soft border border-status-warning/30 transition-all duration-200">
              <div className="text-3xl font-bold text-status-warning">{reviewCards.size}</div>
              <p className="text-sm text-muted-foreground mt-1">Need Review</p>
              <p className="text-xs text-status-warning font-medium">{100 - knownPercentage}%</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 px-4 sm:px-0">
            <Button variant="outline" onClick={handleRestart} className="neu-button w-full sm:w-auto">
              <RotateCcw className="w-4 h-4 mr-2" />
              Start Over
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
                    New Cards
                  </>
                )}
              </Button>
            )}
            <Button onClick={onClose} className="neu-button-primary w-full sm:w-auto">
              <Check className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        </CardContent>

        <Drawer 
          open={isDrawerOpen} 
          onOpenChange={setIsDrawerOpen} 
          side="right" 
          title="Flashcard Collections"
        >
          <div className="p-4 space-y-4">
             {decks.length === 0 && isLoadingDecks && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
             )}
             
             {decks.map((d) => (
               <div 
                 key={d.id} 
                 className={`
                   p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:bg-muted/50
                   ${d.id === deck.id ? 'bg-primary/8 border-primary/40 ring-1 ring-primary/25' : 'bg-card border-border/50'}
                 `}
                 onClick={() => handleSelectDeck(d)}
               >
                 <div className="flex justify-between items-start mb-1">
                   <h3 className="font-medium text-sm line-clamp-1">{d.title}</h3>
                   {d.id === deck.id && (
                     <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Current</Badge>
                   )}
                 </div>
                 <div className="flex flex-wrap items-center gap-2 mt-2">
                   <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md neu-button cursor-default select-none text-[10px]">
                     <Calendar className="w-3 h-3 text-primary" />
                     <span className="font-medium text-foreground">{formatDate(d.createdAt)}</span>
                   </div>
                   <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md neu-button cursor-default select-none text-[10px]">
                     <Layers className="w-3 h-3 text-primary" />
                     <span className="font-medium text-foreground">{d.cards.length} cards</span>
                   </div>
                 </div>
               </div>
             ))}

             {onRegenerate && (
               <Button 
                 onClick={() => {
                   setIsDrawerOpen(false);
                   onRegenerate();
                 }} 
                 disabled={isRegenerating}
                 className="w-full mt-4 neu-button"
                 variant="outline"
               >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate New Collection
               </Button>
             )}
          </div>
        </Drawer>
      </Card>
    );
  }

  return (
    <Card className="relative w-full max-w-2xl mx-auto animate-fade-in-up border-0 sm:border shadow-none sm:shadow-sm">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex gap-2 z-10">
        {(decks.length > 0 || onDeckSelect) && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsDrawerOpen(true)} 
            className="neu-button-subtle h-8 w-8"
            title="Flashcard History"
          >
            <History className="w-4 h-4" />
          </Button>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="neu-button-subtle h-8 w-8"
          title="Exit"
        >
          <X className="w-4 h-4" />
          <span className="sr-only">Exit</span>
        </Button>
      </div>

      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4 overflow-hidden">
        <div className="mb-4 pr-16">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg truncate">Card {currentIndex + 1} of {deck.cards.length}</CardTitle>
            <div className="flex items-center gap-2 text-xs sm:text-sm mt-1 text-muted-foreground max-w-full">
              <span className="truncate">{deck.title}</span>
              {currentCard.category && (
                <Badge 
                  variant="outline" 
                  className="hidden sm:inline-flex shrink-0 max-w-[150px] truncate" 
                  title={currentCard.category}
                >
                  {currentCard.category}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Progress value={progress} className="h-2 w-full" />
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
        {/* Flashcard with 3D flip */}
        <div
          onClick={handleFlip}
          onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? handleFlip() : null}
          role="button"
          tabIndex={0}
          aria-label={isFlipped ? `Answer: ${currentCard.back}. Click to show question.` : `Question: ${currentCard.front}. Click to reveal answer.`}
          className="perspective-1000 cursor-pointer outline-none rounded-xl"
        >
          <div className={`flashcard-inner min-h-[300px] sm:min-h-[250px] ${isFlipped ? 'flipped' : ''}`}>
            {/* Front - Question */}
            <div className="flashcard-face w-full min-h-[300px] sm:min-h-[250px] p-6 rounded-xl border-2 border-border/60 bg-linear-to-br from-card to-muted/40 flex flex-col items-center justify-center text-center">
              <Badge variant="outline" className="mb-4 text-muted-foreground">
                Question
              </Badge>
              <p className="text-lg sm:text-xl font-medium leading-relaxed">
                {currentCard.front}
              </p>
              {currentCard.category && (
                <Badge 
                  variant="outline" 
                  className="mt-4 sm:hidden max-w-[90%] truncate" 
                  title={currentCard.category}
                >
                  {currentCard.category}
                </Badge>
              )}
              <div className="flex items-center gap-2 mt-6 text-sm text-muted-foreground">
                <MousePointerClick className="w-4 h-4" />
                <span>Click to reveal answer</span>
              </div>
            </div>
            
            {/* Back - Answer */}
            <div className="flashcard-face flashcard-back w-full min-h-[300px] sm:min-h-[250px] p-6 rounded-xl border-2 border-primary/40 bg-linear-to-br from-primary/8 to-primary/15 flex flex-col items-center justify-center text-center">
              <Badge className="mb-4 status-info">
                Answer
              </Badge>
              <p className="text-lg sm:text-xl font-medium leading-relaxed">
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
        <div className="flex flex-col-reverse sm:flex-col gap-4">
          
          {/* Controls Container */}
          <div className="space-y-4">
             {/* Action Buttons (Review/Got It) */}
             {isFlipped && (
               <div className="flex gap-3 animate-scale-in w-full">
                 <Button
                   className="neu-button-warning flex-1 h-12 text-sm sm:h-10 sm:text-sm"
                   onClick={handleMarkReview}
                 >
                   <X className="w-4 h-4 mr-1" />
                   Need Review
                 </Button>
                 <Button
                   className="neu-button-success flex-1 h-12 text-sm sm:h-10 sm:text-sm"
                   onClick={handleMarkKnown}
                 >
                   <Check className="w-4 h-4 mr-1" />
                   Got It!
                 </Button>
               </div>
             )}

             {/* Navigation */}
             <div className="flex items-center justify-between w-full">
               <Button
                 variant="outline"
                 onClick={goToPrevious}
                 disabled={currentIndex === 0}
                 className="neu-button flex-1 sm:flex-none mr-2 sm:mr-0"
               >
                 <ChevronLeft className="w-4 h-4 mr-1" />
                 Previous
               </Button>

               <div className="text-sm text-muted-foreground sm:hidden">
                 {currentIndex + 1} / {deck.cards.length}
               </div>

               <Button
                 variant="outline"
                 onClick={goToNext}
                 disabled={currentIndex === deck.cards.length - 1}
                 className="neu-button flex-1 sm:flex-none ml-2 sm:ml-0"
               >
                 Next
                 <ChevronRight className="w-4 h-4 ml-1" />
               </Button>
             </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 text-sm text-muted-foreground pt-2">
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

      <Drawer 
        open={isDrawerOpen} 
        onOpenChange={setIsDrawerOpen} 
        side="right" 
        title="Flashcard Collections"
      >
        <div className="p-4 space-y-4">
           {decks.length === 0 && isLoadingDecks && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
           )}
           
           {decks.map((d) => (
             <div 
               key={d.id} 
               className={`
                 p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:bg-muted/50
                 ${d.id === deck.id ? 'bg-primary/8 border-primary/40 ring-1 ring-primary/25' : 'bg-card border-border/50'}
               `}
               onClick={() => handleSelectDeck(d)}
             >
               <div className="flex justify-between items-start mb-1">
                 <h3 className="font-medium text-sm line-clamp-1">{d.title}</h3>
                 {d.id === deck.id && (
                   <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Current</Badge>
                 )}
               </div>
               <div className="flex flex-wrap items-center gap-2 mt-2">
                 <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md neu-button cursor-default select-none text-[10px]">
                   <Calendar className="w-3 h-3 text-primary" />
                   <span className="font-medium text-foreground">{formatDate(d.createdAt)}</span>
                 </div>
                 <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md neu-button cursor-default select-none text-[10px]">
                   <Layers className="w-3 h-3 text-primary" />
                   <span className="font-medium text-foreground">{d.cards.length} cards</span>
                 </div>
               </div>
             </div>
           ))}

           {onRegenerate && (
             <Button 
               onClick={() => {
                 setIsDrawerOpen(false);
                 onRegenerate();
               }} 
               disabled={isRegenerating}
               className="w-full mt-4 neu-button"
               variant="outline"
             >
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate New Collection
             </Button>
           )}
        </div>
      </Drawer>
    </Card>
  );
}
